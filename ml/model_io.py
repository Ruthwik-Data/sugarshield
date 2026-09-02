"""Shared model loading + inference helpers used by evaluate.py and infer.py.

`load_model` always loads the ADAPTER/CHECKPOINT saved by train.py — never
an "untouched base model". There is no separate base checkpoint to
accidentally fall back to here: train.py's from-scratch run has no base
model at all (weights start random and are saved after training), and the
optional --use_lora path saves a merged/adapter checkpoint via
trainer.save_model() into the same output_dir. Either way, load_model()
raises loudly if output_dir is missing or empty instead of silently
returning something untrained.
"""

import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))
from schema import build_prompt, extract_first_json  # noqa: E402


def load_model(checkpoint_dir):
    from transformers import AutoModelForCausalLM, AutoTokenizer

    if not os.path.isdir(checkpoint_dir) or not os.listdir(checkpoint_dir):
        raise FileNotFoundError(
            f"No trained checkpoint found at {checkpoint_dir}. Run prepare_dataset.py and "
            "train.py first — evaluate.py/infer.py must never fall back to an untrained model."
        )

    # AutoTokenizer works uniformly here: train.py's tokenizer.save_pretrained(output_dir)
    # persists whichever tokenizer was actually used (our custom BPE one for the
    # from-scratch path, or Qwen2.5's own for a --use_lora checkpoint) with its
    # real special-token config, so nothing here needs to hardcode either one's spelling.
    # local_files_only=True is required, not cosmetic: without it, from_pretrained on a
    # pure-local checkpoint dir still probes the Hub for updates, which hangs for a long
    # time (rather than failing fast) against a network egress proxy that hard-blocks
    # huggingface.co at the TCP level.
    tokenizer = AutoTokenizer.from_pretrained(checkpoint_dir, local_files_only=True)

    is_unmerged_lora_adapter = os.path.exists(os.path.join(checkpoint_dir, "adapter_config.json"))
    if is_unmerged_lora_adapter:
        # train.py's --use_lora path saves only the (small) adapter, not the
        # full base model — AutoPeftModelForCausalLM loads the base model
        # named in adapter_config.json's base_model_name_or_path and applies
        # the adapter on top, so this evaluates the actual fine-tuned
        # behavior without requiring a separate merge step first.
        from peft import AutoPeftModelForCausalLM

        model = AutoPeftModelForCausalLM.from_pretrained(checkpoint_dir, local_files_only=True)
    else:
        model = AutoModelForCausalLM.from_pretrained(checkpoint_dir, local_files_only=True)
    model.eval()
    return model, tokenizer


def generate_json(model, tokenizer, product_name, ingredients_raw, nutrition=None, seq_len=None, max_new_tokens=150):
    import torch

    model_max_positions = getattr(model.config, "n_positions", None) or getattr(model.config, "max_position_embeddings", 256)
    seq_len = seq_len or model_max_positions

    prompt = build_prompt(product_name, ingredients_raw, nutrition)
    # Leave room for at least a few generated tokens even for a long prompt.
    prompt_budget = max(8, model_max_positions - 8)
    inputs = tokenizer(prompt, return_tensors="pt", truncation=True, max_length=min(seq_len, prompt_budget))

    prompt_len = inputs["input_ids"].shape[1]
    safe_new_tokens = max(1, min(max_new_tokens, model_max_positions - prompt_len))

    start = time.time()
    with torch.no_grad():
        output_ids = model.generate(
            **inputs,
            max_new_tokens=safe_new_tokens,
            do_sample=False,
            num_beams=1,
            pad_token_id=tokenizer.pad_token_id if tokenizer.pad_token_id is not None else tokenizer.eos_token_id,
            eos_token_id=tokenizer.eos_token_id,
        )
    latency_ms = (time.time() - start) * 1000

    generated = tokenizer.decode(output_ids[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True)
    parsed = extract_first_json(generated)

    return {
        "prompt": prompt,
        "raw_output": generated.strip(),
        "parsed": parsed,
        "latency_ms": latency_ms,
    }
