#!/usr/bin/env python3
"""Merges a LoRA adapter (saved by train.py --use_lora) into its base model,
producing a standalone full model directory ready for GGUF conversion.

Usage:
    python3 ml/merge_lora.py --adapter ./checkpoints/sugarshield-qwen2.5-1.5b \
        --output ./checkpoints/sugarshield-qwen2.5-1.5b-merged
"""

import argparse
import json
import os
import sys


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--adapter", required=True, help="Directory saved by train.py --use_lora (has adapter_config.json)")
    ap.add_argument("--output", required=True, help="Where to save the merged, standalone full model")
    args = ap.parse_args()

    adapter_config_path = os.path.join(args.adapter, "adapter_config.json")
    if not os.path.exists(adapter_config_path):
        print(f"ERROR: {adapter_config_path} not found — {args.adapter} doesn't look like a LoRA adapter "
              "checkpoint from train.py --use_lora.", file=sys.stderr)
        sys.exit(1)

    with open(adapter_config_path) as f:
        adapter_config = json.load(f)
    base_model_name = adapter_config.get("base_model_name_or_path")
    print(f"Base model: {base_model_name}")
    print(f"Adapter:    {args.adapter}")

    from peft import AutoPeftModelForCausalLM
    from transformers import AutoTokenizer

    print("Loading base model + adapter (local_files_only=False — this may need the base model's "
          "Hub cache if it's not already local)...")
    model = AutoPeftModelForCausalLM.from_pretrained(args.adapter)

    print("Merging LoRA weights into the base model...")
    merged = model.merge_and_unload()

    os.makedirs(args.output, exist_ok=True)
    merged.save_pretrained(args.output, safe_serialization=True)

    tokenizer = AutoTokenizer.from_pretrained(args.adapter, local_files_only=True)
    tokenizer.save_pretrained(args.output)

    n_params = sum(p.numel() for p in merged.parameters())
    print(f"Merged model saved to {args.output} ({n_params:,} parameters).")
    print("This directory is now a standalone HF model — usable directly with ml/evaluate.py, "
          "ml/infer.py, and as input to llama.cpp's convert_hf_to_gguf.py.")


if __name__ == "__main__":
    main()
