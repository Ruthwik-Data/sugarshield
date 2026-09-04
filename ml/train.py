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

Usage (from-scratch, the path actually run in the reference environment):
    python3 ml/train.py --prepared_dir ./prepared --output_dir ./checkpoints/sugarshield-v1

Usage (LoRA on a pretrained base, e.g. Qwen2.5-1.5B-Instruct on a Mac with
Hugging Face Hub reachable — see ml/LOCAL_QWEN_FINETUNE.md for the full
checklist including merge + GGUF/Ollama export):
    python3 ml/train.py --prepared_dir ./prepared --output_dir ./checkpoints/sugarshield-qwen2.5-1.5b \
        --use_lora --base_model Qwen/Qwen2.5-1.5B-Instruct \
        --device auto --dtype auto --gradient_checkpointing \
        --lora_r 8 --lora_alpha 16 --lora_target_modules q_proj,v_proj \
        --epochs 1 --batch_size 2 --grad_accum 8
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
    """Tokenizes prompt+target, masking the prompt portion out of the loss.

    Appends the tokenizer's OWN eos_token_id after the target (never a
    hardcoded string) — see schema.build_target's docstring for why: a
    pretrained tokenizer (Qwen2.5's, for --use_lora) has its own eos_token
    that must be used verbatim, not the from-scratch pipeline's "<|end|>".
    """
    eos_id = tokenizer.eos_token_id
    input_ids_list, labels_list, attn_list = [], [], []
    for p in pairs:
        prompt_ids = tokenizer(p["prompt"], add_special_tokens=False)["input_ids"]
        target_ids = tokenizer(p["target"], add_special_tokens=False)["input_ids"]
        if eos_id is not None:
            target_ids = target_ids + [eos_id]
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


def resolve_device(requested):
    import torch

    if requested != "auto":
        return requested
    if torch.cuda.is_available():
        return "cuda"
    if getattr(torch.backends, "mps", None) is not None and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def resolve_dtype(requested, device):
    import torch

    mapping = {"float32": torch.float32, "float16": torch.float16, "bfloat16": torch.bfloat16}
    if requested != "auto":
        return mapping[requested]
    # CPU training in fp16/bf16 is generally unsupported/slow in PyTorch; the
    # from-scratch path always wants fp32. On MPS/CUDA, bf16 halves memory
    # and is the precision Qwen2.5 was itself trained/released in.
    if device in ("mps", "cuda"):
        return torch.bfloat16
    return torch.float32


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
    ap.add_argument("--base_model", default=None, help="Only used with --use_lora, e.g. Qwen/Qwen2.5-1.5B-Instruct or a local path")
    ap.add_argument("--device", default="auto", choices=["auto", "cpu", "mps", "cuda"])
    ap.add_argument("--dtype", default="auto", choices=["auto", "float32", "float16", "bfloat16"])
    ap.add_argument("--gradient_checkpointing", action="store_true", help="Trade compute for memory; recommended on Mac for --use_lora")
    ap.add_argument("--lora_r", type=int, default=8)
    ap.add_argument("--lora_alpha", type=int, default=16)
    ap.add_argument("--lora_dropout", type=float, default=0.05)
    ap.add_argument(
        "--use_rslora",
        action="store_true",
        help="Rank-stabilized LoRA (peft's LoraConfig.use_rslora) -- scales lora_alpha by 1/sqrt(r) instead of "
        "1/r, which tends to help higher-rank adapters (e.g. r=16+) train more stably.",
    )
    ap.add_argument(
        "--use_dora",
        action="store_true",
        help="Weight-Decomposed LoRA (peft's LoraConfig.use_dora) -- decomposes each adapted weight into "
        "magnitude + direction, closer to full fine-tuning behavior at a small additional compute cost. "
        "Both flags are already supported by the peft>=0.10 dependency already pinned in requirements.txt; "
        "no new library needed.",
    )
    ap.add_argument(
        "--resume_from_checkpoint",
        nargs="?",
        const=True,
        default=None,
        help="Resume training after an interruption. Pass with no value to auto-resume from the latest "
        "checkpoint-* subdir already in --output_dir (save_strategy=epoch keeps the most recent one), "
        "or pass an explicit checkpoint directory path.",
    )
    ap.add_argument(
        "--lora_target_modules",
        default="q_proj,v_proj",
        help="Comma-separated module names. Qwen2.5 (LLaMA-style attention): q_proj,v_proj for a small "
        "first run; add k_proj,o_proj (and gate_proj,up_proj,down_proj for the MLP) to scale up.",
    )
    ap.add_argument(
        "--results_dir",
        default=None,
        help="Where to write training_run.json. Defaults to ml/results/ (the shipped from-scratch run's "
        "location) — pass a distinct directory (e.g. ./results_qwen) for any other run so you don't "
        "overwrite that committed baseline record.",
    )
    args = ap.parse_args()

    import torch
    from transformers import Trainer, TrainingArguments, set_seed

    set_seed(args.seed)
    device = resolve_device(args.device)
    dtype = resolve_dtype(args.dtype, device)

    train_pairs = load_jsonl(os.path.join(args.prepared_dir, "train.jsonl"))
    val_pairs = load_jsonl(os.path.join(args.prepared_dir, "validation.jsonl"))
    if args.max_train_examples and args.max_train_examples > 0:
        train_pairs = train_pairs[: args.max_train_examples]

    if not train_pairs:
        print("ERROR: no training examples found — run prepare_dataset.py first.", file=sys.stderr)
        sys.exit(1)

    method = "full_parameter_from_scratch"
    base_model_name = f"sugarshield-tiny-gpt2 (from scratch, {args.n_layer}L/{args.n_embd}d/{args.n_head}h)"
    lora_target_modules = None

    if args.use_lora and args.base_model:
        from peft import LoraConfig, get_peft_model
        from transformers import AutoModelForCausalLM, AutoTokenizer

        tokenizer = AutoTokenizer.from_pretrained(args.base_model)
        if tokenizer.pad_token is None:
            tokenizer.pad_token = tokenizer.eos_token

        model = AutoModelForCausalLM.from_pretrained(args.base_model, torch_dtype=dtype)
        model.to(device)

        if args.gradient_checkpointing:
            model.gradient_checkpointing_enable()
            model.enable_input_require_grads()

        lora_target_modules = [m.strip() for m in args.lora_target_modules.split(",") if m.strip()]
        lora_cfg = LoraConfig(
            r=args.lora_r,
            lora_alpha=args.lora_alpha,
            lora_dropout=args.lora_dropout,
            bias="none",
            task_type="CAUSAL_LM",
            target_modules=lora_target_modules,
            use_rslora=args.use_rslora,
            use_dora=args.use_dora,
        )
        model = get_peft_model(model, lora_cfg)
        model.print_trainable_parameters()
        method = "lora" + ("+rslora" if args.use_rslora else "") + ("+dora" if args.use_dora else "")
        base_model_name = args.base_model
    else:
        tokenizer_dir = os.path.join(args.prepared_dir, "tokenizer")
        tokenizer = build_tokenizer(tokenizer_dir)
        model = build_scratch_model(tokenizer.vocab_size, args.seq_len, args.n_layer, args.n_embd, args.n_head)
        model.to(device)

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

    # bf16=True here tells the Trainer to autocast the forward/backward pass;
    # the model's own weights were already loaded in `dtype` above via
    # torch_dtype= (for --use_lora) — these two settings should normally
    # match. fp16 uses a loss-scaler that historically has NaN issues on
    # MPS, so it's only enabled for CUDA.
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
        use_cpu=(device == "cpu"),
        bf16=(dtype == torch.bfloat16 and device != "mps"),
        dataloader_num_workers=0,
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_ds,
        eval_dataset=val_ds,
    )

    # HF Trainer/Accelerate compute their OWN device placement internally
    # from `training_args`, independent of the `model.to(device)` call
    # already done above -- on some transformers/accelerate version
    # combinations this silently resolves to CPU even when MPS/CUDA is
    # available and was explicitly requested, which is exactly what turned
    # a several-minutes-per-epoch LoRA run into a 250+ seconds/step,
    # 80+ hour one with no error at all. Log what Trainer actually resolved
    # to, and force the model back onto the intended device if it disagrees
    # -- cheap, harmless when they already agree, and makes this class of
    # bug visible in the log instead of silent.
    print(f"[train] requested device={device!r}, Trainer resolved args.device={trainer.args.device!r}", flush=True)
    if str(trainer.args.device) != str(device):
        print(f"[train] MISMATCH -- forcing the model back onto {device!r}", flush=True)
    model.to(device)

    if device == "cpu":
        hardware = f"{platform.processor() or platform.machine()}, {os.cpu_count()} vCPUs, CPU-only (no GPU available)"
    else:
        hardware = f"{platform.processor() or platform.machine()}, device={device}, dtype={dtype}"

    start = time.time()
    train_result = trainer.train(resume_from_checkpoint=args.resume_from_checkpoint)
    duration_s = time.time() - start

    eval_metrics = trainer.evaluate() if val_ds else {}

    trainer.save_model(args.output_dir)
    tokenizer.save_pretrained(args.output_dir)

    run_info = {
        "base_model": base_model_name,
        "fine_tuning_method": method,
        "reason_not_lora_on_pretrained": (
            None
            if "lora" in method
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
        "lora_rank": args.lora_r if "lora" in method else None,
        "lora_alpha": args.lora_alpha if "lora" in method else None,
        "lora_dropout": args.lora_dropout if "lora" in method else None,
        "lora_use_rslora": args.use_rslora if "lora" in method else None,
        "lora_use_dora": args.use_dora if "lora" in method else None,
        "device": device,
        "dtype": str(dtype),
        "quantization": "none",
        "target_modules": "n/a (full-parameter training)" if "lora" not in method else ",".join(lora_target_modules),
        "gradient_checkpointing": bool(args.gradient_checkpointing) if "lora" in method else False,
        "random_seed": args.seed,
        "hardware": hardware,
        "train_runtime_seconds": round(duration_s, 1),
        "final_train_loss": train_result.metrics.get("train_loss"),
        "eval_loss": eval_metrics.get("eval_loss"),
        "output_dir": args.output_dir,
        "trained_at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }

    results_dir = args.results_dir or os.path.normpath(os.path.join(os.path.dirname(__file__), "results"))
    os.makedirs(results_dir, exist_ok=True)
    # Also colocate a copy with the checkpoint itself, so each run's own
    # metadata travels with it regardless of --results_dir.
    with open(os.path.join(args.output_dir, "training_run.json"), "w", encoding="utf-8") as f:
        json.dump(run_info, f, indent=2)
    with open(os.path.join(results_dir, "training_run.json"), "w", encoding="utf-8") as f:
        json.dump(run_info, f, indent=2)

    print(json.dumps(run_info, indent=2))


if __name__ == "__main__":
    main()
