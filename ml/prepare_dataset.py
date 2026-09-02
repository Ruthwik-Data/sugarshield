#!/usr/bin/env python3
"""Turns data/{train,validation,gold}/*.jsonl into prompt/target text pairs
and trains a small byte-level BPE tokenizer on SugarShield's own corpus.

Why a custom tokenizer instead of a pretrained one (e.g. GPT-2's)? Hugging
Face Hub is blocked by network policy in the reference training environment
(see ml/README.md), and a tokenizer's vocab file has to come from somewhere.
Training a small BPE vocab directly on our prompt+target corpus is a
standard, fully offline technique and is actually a good fit here: the
vocabulary only needs to cover ingredient-label English and our fixed JSON
schema, not general-purpose text.

Usage:
    python3 ml/prepare_dataset.py \
        --train ../data/train/train.jsonl \
        --validation ../data/validation/validation.jsonl \
        --gold ../data/gold/gold.jsonl \
        --out_dir ./prepared \
        --vocab_size 6000
"""

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from schema import build_prompt, build_target, EOS  # noqa: E402


def load_jsonl(path):
    records = []
    if not path or not os.path.exists(path):
        return records
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            records.append(json.loads(line))
    return records


def to_pairs(records):
    pairs = []
    for r in records:
        prompt = build_prompt(r.get("product_name"), r.get("ingredients_raw"), r.get("nutrition"))
        target = build_target(r)
        pairs.append({"id": r.get("id"), "prompt": prompt, "target": target, "text": prompt + target})
    return pairs


def train_tokenizer(texts, vocab_size, out_path):
    from tokenizers import ByteLevelBPETokenizer

    tmp_corpus = out_path + ".corpus.txt"
    with open(tmp_corpus, "w", encoding="utf-8") as f:
        for t in texts:
            f.write(t.replace("\n", " \\n ") + "\n")

    tokenizer = ByteLevelBPETokenizer()
    special_tokens = ["<pad>", "<bos>", EOS, "<unk>"]
    tokenizer.train(
        files=[tmp_corpus],
        vocab_size=vocab_size,
        min_frequency=2,
        special_tokens=special_tokens,
    )
    os.makedirs(out_path, exist_ok=True)
    tokenizer.save_model(out_path)
    tokenizer.save(os.path.join(out_path, "tokenizer.json"))
    os.remove(tmp_corpus)
    return tokenizer


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--train", default="../data/train/train.jsonl")
    ap.add_argument("--validation", default="../data/validation/validation.jsonl")
    ap.add_argument("--gold", default="../data/gold/gold.jsonl")
    ap.add_argument("--out_dir", default="./prepared")
    ap.add_argument("--vocab_size", type=int, default=6000)
    args = ap.parse_args()

    train_records = load_jsonl(args.train)
    val_records = load_jsonl(args.validation)
    gold_records = load_jsonl(args.gold)

    if not train_records:
        print(f"ERROR: no training records found at {args.train}", file=sys.stderr)
        sys.exit(1)

    train_pairs = to_pairs(train_records)
    val_pairs = to_pairs(val_records)
    gold_pairs = to_pairs(gold_records)

    os.makedirs(args.out_dir, exist_ok=True)
    for name, pairs in [("train", train_pairs), ("validation", val_pairs), ("gold", gold_pairs)]:
        with open(os.path.join(args.out_dir, f"{name}.jsonl"), "w", encoding="utf-8") as f:
            for p in pairs:
                f.write(json.dumps(p) + "\n")

    tokenizer_dir = os.path.join(args.out_dir, "tokenizer")
    all_texts = [p["text"] for p in train_pairs] + [p["prompt"] for p in val_pairs + gold_pairs]
    train_tokenizer(all_texts, args.vocab_size, tokenizer_dir)

    stats = {
        "train_examples": len(train_pairs),
        "validation_examples": len(val_pairs),
        "gold_examples": len(gold_pairs),
        "vocab_size_requested": args.vocab_size,
        "tokenizer_dir": tokenizer_dir,
    }
    with open(os.path.join(args.out_dir, "prepare_stats.json"), "w", encoding="utf-8") as f:
        json.dump(stats, f, indent=2)
    print(json.dumps(stats, indent=2))


if __name__ == "__main__":
    main()
