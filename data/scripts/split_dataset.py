#!/usr/bin/env python3
"""
data/scripts/split_dataset.py

1. Removes anything in data/gold/gold.jsonl from the labeled pool
   (data/processed/all_records.jsonl) -- by exact id match, and by a
   size/pack-stripped (product_name, brand) fuzzy key, so a different SKU
   of the same gold product (e.g. a different bottle size) doesn't leak in
   either.
2. Splits what's left ~90/10 into train/validation, stratified as best-effort
   by (risk_level, category) with random seed 42.
3. Writes data/train/train.jsonl and data/validation/validation.jsonl.
"""

import json
import os
import random
import re
import sys

IN_PATH = os.path.join(os.path.dirname(__file__), "..", "processed", "all_records.jsonl")
GOLD_PATH = os.path.join(os.path.dirname(__file__), "..", "gold", "gold.jsonl")
TRAIN_PATH = os.path.join(os.path.dirname(__file__), "..", "train", "train.jsonl")
VAL_PATH = os.path.join(os.path.dirname(__file__), "..", "validation", "validation.jsonl")
os.makedirs(os.path.dirname(TRAIN_PATH), exist_ok=True)
os.makedirs(os.path.dirname(VAL_PATH), exist_ok=True)

SEED = 42
VAL_FRACTION = 0.10

_SIZE_PACK_RE = re.compile(r"\s*-\s*\d.*$|\s*\(\d.*\)\s*$", re.IGNORECASE)


def fuzzy_key(product_name: str, brand: str) -> str:
    base = _SIZE_PACK_RE.sub("", product_name or "").strip().lower()
    base = re.sub(r"[^a-z0-9]+", " ", base).strip()
    return f"{base}|{(brand or '').strip().lower()}"


def load_jsonl(path):
    with open(path) as f:
        return [json.loads(line) for line in f if line.strip()]


def main():
    pool = load_jsonl(IN_PATH)
    gold = load_jsonl(GOLD_PATH)

    gold_ids = {r["id"] for r in gold}
    gold_fuzzy_keys = {fuzzy_key(r["product_name"], r.get("brand") or "") for r in gold}

    remaining = []
    excluded_by_id = 0
    excluded_by_fuzzy = 0
    for r in pool:
        if r["id"] in gold_ids:
            excluded_by_id += 1
            continue
        if fuzzy_key(r["product_name"], r.get("brand") or "") in gold_fuzzy_keys:
            excluded_by_fuzzy += 1
            continue
        remaining.append(r)

    print(f"[split] pool={len(pool)} gold={len(gold)} "
          f"excluded_by_id={excluded_by_id} excluded_by_fuzzy_name_brand={excluded_by_fuzzy} "
          f"remaining={len(remaining)}", file=sys.stderr)

    # Stratified split by (risk_level, category): shuffle within each stratum
    # deterministically, then peel off ~VAL_FRACTION into validation.
    strata = {}
    for r in remaining:
        key = (r["risk_level"], r["category"])
        strata.setdefault(key, []).append(r)

    rng = random.Random(SEED)
    train, val = [], []
    for key, items in strata.items():
        items = list(items)
        rng.shuffle(items)
        n_val = round(len(items) * VAL_FRACTION)
        # Guarantee at least the stratum isn't entirely swallowed either way
        # for small strata, but keep it simple/deterministic.
        val.extend(items[:n_val])
        train.extend(items[n_val:])

    rng.shuffle(train)
    rng.shuffle(val)

    with open(TRAIN_PATH, "w") as f:
        for r in train:
            f.write(json.dumps(r) + "\n")
    with open(VAL_PATH, "w") as f:
        for r in val:
            f.write(json.dumps(r) + "\n")

    print(f"[split] train={len(train)} -> {TRAIN_PATH}", file=sys.stderr)
    print(f"[split] validation={len(val)} -> {VAL_PATH}", file=sys.stderr)


if __name__ == "__main__":
    main()
