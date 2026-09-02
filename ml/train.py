#!/usr/bin/env python3
"""Trains a small SugarShield causal LM from scratch (full-parameter, CPU).

Why "from scratch" and not LoRA on a pretrained checkpoint: see
ml/README.md. Short version — Hugging Face Hub and every other reachable
source of pretrained transformer weights are blocked by network egress
policy in the reference environment, so there is no pretrained base to
attach a LoRA adapter to. This script still accepts --use_lora for anyone
running it in an environment where a pretrained checkpoint IS reachable
(pass --base_model <local-path-or-hub-id>), in which case it fine-tunes
with peft/LoRA instead of training from scratch. Actually executed runs in
the reference environment always take the from-scratch path.

Usage (from-scratch, the path actually run):
    python3 ml/train.py --prepared_dir ./prepared --output_dir ./checkpoints/sugarshield-v1

Usage (LoRA on a pretrained base, if one is reachable in your environment):
    python3 ml/train.py --prepared_dir ./prepared --output_dir ./checkpoints/sugarshield-v1 \
        --base_model <hub-id-or-local-path> --use_lora
"""

import argparse
import json
import os
import platform
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))
from schema import EOS  # noqa: E402


def load_jsonl(path):
    records = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    return records


def build_tokenizer(tokenizer_dir):
    from transformers import PreTrainedTokenizerFast

    tok = PreTrainedTokenizerFast(tokenizer_file=os.path.join(tokenizer_dir, "tokenizer.json"))
    tok.pad_token = "<pad>"
    tok.bos_token = "<bos>"
    tok.eos_token = EOS
    tok.unk_token = "<unk>"
    return tok


def build_scratch_model(vocab_size, seq_len, n_layer, n_embd, n_head):
    from transformers import GPT2Config, GPT2LMHeadModel

    config = GPT2Config(
        vocab_size=vocab_size,
        n_positions=seq_len,
        n_ctx=seq_len,
        n_embd=n_embd,
        n_layer=n_layer,
        n_head=n_head,
        n_inner=n_embd * 4,
        bos_token_id=1,
        eos_token_id=2,
        pad_token_id=0,
    )
    model = GPT2LMHeadModel(config)
    return model


def tokenize_examples(pairs, tokenizer, seq_len):
    """Tokenizes prompt+target, masking the prompt portion out of the loss."""
    input_ids_list, labels_list, attn_list = [], [], []
    for p in pairs:
        prompt_ids = tokenizer(p["prompt"], add_special_tokens=False)["input_ids"]
        target_ids = tokenizer(p["target"], add_special_tokens=False)["input_ids"]
        ids = (prompt_ids + target_ids)[:seq_len]
        labels = ([-100] * len(prompt_ids) + target_ids)[:seq_len]
        attn = [1] * len(ids)
        pad_len = seq_len - len(ids)
        if pad_len > 0:
            pad_id = tokenizer.pad_token_id
            ids = ids + [pad_id] * pad_len
            labels = labels + [-100] * pad_len
            attn = attn + [0] * pad_len
        input_ids_list.append(ids)
        labels_list.append(labels)
        attn_list.append(attn)
    return {"input_ids": input_ids_list, "labels": labels_list, "attention_mask": attn_list}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--prepared_dir", default="./prepared")
    ap.add_argument("--output_dir", default="./checkpoints/sugarshield-v1")
    ap.add_argument("--seq_len", type=int, default=256)
    ap.add_argument("--n_layer", type=int, default=6)
    ap.add_argument("--n_embd", type=int, default=256)
    ap.add_argument("--n_head", type=int, default=8)
    ap.add_argument("--epochs", type=float, default=6.0)
    ap.add_argument("--batch_size", type=int, default=8)
    ap.add_argument("--grad_accum", type=int, default=2)
    ap.add_argument("--lr", type=float, default=5e-4)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--max_train_examples", type=int, default=0, help="0 = use all")
    ap.add_argument("--use_lora", action="store_true")
    ap.add_argument("--base_model", default=None, help="Only used with --use_lora")
    args = ap.parse_args()

    import torch
    from transformers import Trainer, TrainingArguments, set_seed

    set_seed(args.seed)

    tokenizer_dir = os.path.join(args.prepared_dir, "tokenizer")
    tokenizer = build_tokenizer(tokenizer_dir)

    train_pairs = load_jsonl(os.path.join(args.prepared_dir, "train.jsonl"))
    val_pairs = load_jsonl(os.path.join(args.prepared_dir, "validation.jsonl"))
    if args.max_train_examples and args.max_train_examples > 0:
        train_pairs = train_pairs[: args.max_train_examples]

    if not train_pairs:
        print("ERROR: no training examples found — run prepare_dataset.py first.", file=sys.stderr)
        sys.exit(1)

    method = "full_parameter_from_scratch"
    base_model_name = f"sugarshield-tiny-gpt2 (from scratch, {args.n_layer}L/{args.n_embd}d/{args.n_head}h)"

    if args.use_lora and args.base_model:
        from peft import LoraConfig, get_peft_model
        from transformers import AutoModelForCausalLM, AutoTokenizer

        tokenizer = AutoTokenizer.from_pretrained(args.base_model)
        model = AutoModelForCausalLM.from_pretrained(args.base_model)
        lora_cfg = LoraConfig(
            r=8, lora_alpha=16, lora_dropout=0.05, bias="none", task_type="CAUSAL_LM"
        )
        model = get_peft_model(model, lora_cfg)
        method = "lora"
        base_model_name = args.base_model
    else:
        model = build_scratch_model(tokenizer.vocab_size, args.seq_len, args.n_layer, args.n_embd, args.n_head)

    n_params = sum(p.numel() for p in model.parameters())
    n_trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)

    train_tok = tokenize_examples(train_pairs, tokenizer, args.seq_len)
    val_tok = tokenize_examples(val_pairs, tokenizer, args.seq_len) if val_pairs else None

    from datasets import Dataset

    train_ds = Dataset.from_dict(train_tok)
    val_ds = Dataset.from_dict(val_tok) if val_tok else None
    train_ds.set_format(type="torch")
    if val_ds:
        val_ds.set_format(type="torch")

    os.makedirs(args.output_dir, exist_ok=True)

    training_args = TrainingArguments(
        output_dir=args.output_dir,
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=args.grad_accum,
        per_device_eval_batch_size=args.batch_size,
        learning_rate=args.lr,
        weight_decay=0.01,
        warmup_steps=max(5, len(train_pairs) // (args.batch_size * args.grad_accum) // 4),
        logging_steps=10,
        eval_strategy="epoch" if val_ds else "no",
        save_strategy="epoch",
        save_total_limit=1,
        report_to=[],
        seed=args.seed,
        use_cpu=True,
        dataloader_num_workers=0,
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_ds,
        eval_dataset=val_ds,
    )

    hardware = f"{platform.processor() or platform.machine()}, {os.cpu_count()} vCPUs, CPU-only (no CUDA GPU available)"

    start = time.time()
    train_result = trainer.train()
    duration_s = time.time() - start

    eval_metrics = trainer.evaluate() if val_ds else {}

    trainer.save_model(args.output_dir)
    tokenizer.save_pretrained(args.output_dir)

    run_info = {
        "base_model": base_model_name,
        "fine_tuning_method": method,
        "reason_not_lora_on_pretrained": (
            None
            if method == "lora"
            else "Hugging Face Hub and every other reachable source of pretrained transformer "
            "weights returned a hard 403 policy denial from this environment's network egress "
            "proxy (huggingface.co, download.pytorch.org, etc). With no pretrained checkpoint "
            "obtainable, LoRA/QLoRA (which fine-tunes an existing pretrained model) is not "
            "applicable; this run trains a small GPT-2-architecture model with randomly "
            "initialized weights, full-parameter, instead."
        ),
        "parameters_total": n_params,
        "parameters_trainable": n_trainable,
        "train_examples": len(train_pairs),
        "validation_examples": len(val_pairs),
        "epochs": args.epochs,
        "batch_size": args.batch_size,
        "gradient_accumulation_steps": args.grad_accum,
        "effective_batch_size": args.batch_size * args.grad_accum,
        "learning_rate": args.lr,
        "sequence_length": args.seq_len,
        "lora_rank": 8 if method == "lora" else None,
        "lora_alpha": 16 if method == "lora" else None,
        "quantization": "none (fp32 CPU)",
        "target_modules": "n/a (full-parameter training)" if method != "lora" else "q_proj,v_proj",
        "random_seed": args.seed,
        "hardware": hardware,
        "train_runtime_seconds": round(duration_s, 1),
        "final_train_loss": train_result.metrics.get("train_loss"),
        "eval_loss": eval_metrics.get("eval_loss"),
        "output_dir": args.output_dir,
        "trained_at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }

    results_dir = os.path.normpath(os.path.join(os.path.dirname(__file__), "results"))
    os.makedirs(results_dir, exist_ok=True)
    with open(os.path.join(results_dir, "training_run.json"), "w", encoding="utf-8") as f:
        json.dump(run_info, f, indent=2)

    print(json.dumps(run_info, indent=2))


if __name__ == "__main__":
    main()
