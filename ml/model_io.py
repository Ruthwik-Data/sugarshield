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


def resolve_device(requested="auto"):
    """Same resolution order as train.py's resolve_device — kept as an
    independent copy (not imported) so model_io.py has no import-time
    dependency on argparse-only code in train.py."""
    import torch

    if requested != "auto":
        return requested
    if torch.cuda.is_available():
        return "cuda"
    if getattr(torch.backends, "mps", None) is not None and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def load_model(checkpoint_dir, device="auto"):
    from transformers import AutoModelForCausalLM, AutoTokenizer

    if not os.path.isdir(checkpoint_dir) or not os.listdir(checkpoint_dir):
        raise FileNotFoundError(
            f"No trained checkpoint found at {checkpoint_dir}. Run prepare_dataset.py and "
            "train.py first — evaluate.py/infer.py must never fall back to an untrained model."
        )

    resolved_device = resolve_device(device)

    # AutoTokenizer works uniformly here: train.py's tokenizer.save_pretrained(output_dir)
    # persists whichever tokenizer was actually used (our custom BPE one for the
    # from-scratch path, or Qwen2.5's own for a --use_lora checkpoint) with its
    # real special-token config, so nothing here needs to hardcode either one's spelling.
    # local_files_only=True is required, not cosmetic: without it, from_pretrained on a
    # pure-local checkpoint dir still probes the Hub for updates, which hangs for a long
    # time (rather than failing fast) against a network egress proxy that hard-blocks
    # huggingface.co at the TCP level.
    tokenizer = AutoTokenizer.from_pretrained(checkpoint_dir, local_files_only=True)

    # torch_dtype="auto" reuses whatever dtype the checkpoint itself was saved/trained in
    # (e.g. bf16 for a Mac LoRA run) instead of transformers' from_pretrained default of
    # upcasting to fp32, which roughly doubles both memory and generation time for no
    # accuracy benefit at inference time.
    is_unmerged_lora_adapter = os.path.exists(os.path.join(checkpoint_dir, "adapter_config.json"))
    if is_unmerged_lora_adapter:
        # train.py's --use_lora path saves only the (small) adapter, not the
        # full base model — AutoPeftModelForCausalLM loads the base model
        # named in adapter_config.json's base_model_name_or_path and applies
        # the adapter on top, so this evaluates the actual fine-tuned
        # behavior without requiring a separate merge step first.
        from peft import AutoPeftModelForCausalLM

        model = AutoPeftModelForCausalLM.from_pretrained(checkpoint_dir, local_files_only=True, torch_dtype="auto")
    else:
        model = AutoModelForCausalLM.from_pretrained(checkpoint_dir, local_files_only=True, torch_dtype="auto")

    # This is the fix for the 25-minutes-on-MPS report: from_pretrained() alone never
    # moves the model off CPU, no matter what hardware trained it — a real GPU/MPS box
    # that skips this line silently runs every generate() call on CPU instead.
    model.to(resolved_device)
    model.eval()
    model._sugarshield_device = resolved_device
    return model, tokenizer


def generate_json(model, tokenizer, product_name, ingredients_raw, nutrition=None, seq_len=None, max_new_tokens=128):
    """max_new_tokens=128 is a measured ceiling, not a guess: the schema's target JSON
    (schema.build_target) truncates `explanation` to 220 chars, and the full worst-case
    payload (every boolean true, 3 detected_sugars, 2 artificial_sweeteners, a maxed-out
    explanation) is 556 characters — at a conservative ~2.5 chars/token for dense,
    punctuation-heavy JSON that's ~223 tokens, but real explanations from the rule engine
    (what the model was trained to imitate) run 60-150 chars, not the full 220-char cap,
    so 128 covers the realistic case with headroom. Lower this further (e.g. 96) once you
    can see your own model's typical raw_output length in the per-sample logs and confirm
    it isn't truncating valid JSON.
    """
    import torch

    device = getattr(model, "_sugarshield_device", None) or str(next(model.parameters()).device)

    model_max_positions = getattr(model.config, "n_positions", None) or getattr(model.config, "max_position_embeddings", 256)
    seq_len = seq_len or model_max_positions

    prompt = build_prompt(product_name, ingredients_raw, nutrition)
    # Leave room for at least a few generated tokens even for a long prompt.
    prompt_budget = max(8, model_max_positions - 8)
    inputs = tokenizer(prompt, return_tensors="pt", truncation=True, max_length=min(seq_len, prompt_budget))
    inputs = {k: v.to(device) for k, v in inputs.items()}

    prompt_len = inputs["input_ids"].shape[1]
    safe_new_tokens = max(1, min(max_new_tokens, model_max_positions - prompt_len))

    start = time.time()
    with torch.inference_mode():
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
        "generated_tokens": output_ids.shape[1] - prompt_len,
    }
