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
from schema import build_prompt, extract_first_json, EOS  # noqa: E402


def load_model(checkpoint_dir):
    import torch
    from transformers import AutoModelForCausalLM, PreTrainedTokenizerFast

    if not os.path.isdir(checkpoint_dir) or not os.listdir(checkpoint_dir):
        raise FileNotFoundError(
            f"No trained checkpoint found at {checkpoint_dir}. Run prepare_dataset.py and "
            "train.py first — evaluate.py/infer.py must never fall back to an untrained model."
        )

    tokenizer_file = os.path.join(checkpoint_dir, "tokenizer.json")
    if not os.path.exists(tokenizer_file):
        raise FileNotFoundError(f"tokenizer.json missing from {checkpoint_dir}")

    tokenizer = PreTrainedTokenizerFast(tokenizer_file=tokenizer_file)
    tokenizer.pad_token = "<pad>"
    tokenizer.bos_token = "<bos>"
    tokenizer.eos_token = EOS
    tokenizer.unk_token = "<unk>"

    model = AutoModelForCausalLM.from_pretrained(checkpoint_dir)
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
        eos_id = tokenizer.convert_tokens_to_ids(EOS)
        output_ids = model.generate(
            **inputs,
            max_new_tokens=safe_new_tokens,
            do_sample=False,
            num_beams=1,
            pad_token_id=tokenizer.pad_token_id,
            eos_token_id=eos_id if eos_id is not None and eos_id >= 0 else None,
        )
    latency_ms = (time.time() - start) * 1000

    generated = tokenizer.decode(output_ids[0][inputs["input_ids"].shape[1]:], skip_special_tokens=False)
    generated_clean = generated.replace(EOS, "")
    parsed = extract_first_json(generated_clean)

    return {
        "prompt": prompt,
        "raw_output": generated_clean.strip(),
        "parsed": parsed,
        "latency_ms": latency_ms,
    }
