#!/usr/bin/env python3
"""
data/scripts/detect_leakage.py

Hard requirement: zero overlap between the frozen gold benchmark and
train/validation. Checks, for gold vs train and gold vs validation:
  1. exact `id` overlap
  2. exact (product_name, ingredients_raw) overlap

Prints a clear PASS/FAIL report and exits non-zero on any failure.
"""

import json
import os
import sys

GOLD_PATH = os.path.join(os.path.dirname(__file__), "..", "gold", "gold.jsonl")
TRAIN_PATH = os.path.join(os.path.dirname(__file__), "..", "train", "train.jsonl")
VAL_PATH = os.path.join(os.path.dirname(__file__), "..", "validation", "validation.jsonl")


def load_jsonl(path):
    with open(path) as f:
        return [json.loads(line) for line in f if line.strip()]


def check(gold, other, other_name):
    gold_ids = {r["id"] for r in gold}
    other_ids = {r["id"] for r in other}
    id_overlap = gold_ids & other_ids

    gold_pairs = {(r["product_name"], r["ingredients_raw"]) for r in gold}
    other_pairs = {(r["product_name"], r["ingredients_raw"]) for r in other}
    pair_overlap = gold_pairs & other_pairs

    ok = len(id_overlap) == 0 and len(pair_overlap) == 0
    status = "PASS" if ok else "FAIL"
    print(f"[leakage] gold vs {other_name}: {status} "
          f"(id_overlap={len(id_overlap)}, exact_name_ingredients_overlap={len(pair_overlap)})")
    if id_overlap:
        print(f"           overlapping ids (first 10): {sorted(id_overlap)[:10]}")
    if pair_overlap:
        print(f"           overlapping (name, ingredients) pairs (first 5): {list(pair_overlap)[:5]}")
    return ok


def main():
    gold = load_jsonl(GOLD_PATH)
    train = load_jsonl(TRAIN_PATH)
    val = load_jsonl(VAL_PATH)

    print(f"[leakage] gold={len(gold)} train={len(train)} validation={len(val)}")
    ok1 = check(gold, train, "train")
    ok2 = check(gold, val, "validation")

    overall = "PASS" if (ok1 and ok2) else "FAIL"
    print(f"\n[leakage] OVERALL: {overall}")
    if overall != "PASS":
        sys.exit(1)


if __name__ == "__main__":
    main()
