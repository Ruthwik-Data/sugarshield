#!/usr/bin/env python3
"""
data/scripts/detect_leakage.py

Hard requirement: zero overlap between the frozen gold benchmark and
train/validation. Checks, for gold vs train and gold vs validation:
  1. exact `id` overlap
  2. exact (product_name, ingredients_raw) overlap

ALSO checks train/validation against the frozen, independently-labeled
132-record benchmark (data/independent_gold/independent_gold.jsonl) —
"KEEP THE 132-PRODUCT INDEPENDENT TEST SET FROZEN. Never train on it." is
a hard requirement of the Fine-tune V2 project, and this file's `id` format
differs from train/validation's (train/validation ids are "gdb_<original_id>"
from clean_and_normalize.py; independent_gold ids are "indep_NNN" with the
raw GroceryDB original_id in its own `source_product_id` field), so the
gold-vs-train check above cannot catch this on its own — it needs its own
check keyed on the underlying GroceryDB original_id.

Prints a clear PASS/FAIL report and exits non-zero on any failure.
"""

import json
import os
import sys

GOLD_PATH = os.path.join(os.path.dirname(__file__), "..", "gold", "gold.jsonl")
TRAIN_PATH = os.path.join(os.path.dirname(__file__), "..", "train", "train.jsonl")
VAL_PATH = os.path.join(os.path.dirname(__file__), "..", "validation", "validation.jsonl")
INDEPENDENT_GOLD_PATH = os.path.join(os.path.dirname(__file__), "..", "independent_gold", "independent_gold.jsonl")


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


def _train_val_original_ids(records):
    """train/validation ids are "gdb_<original_id>" (from
    clean_and_normalize.py) for real GroceryDB-sourced rows; anything else
    (e.g. a v1-eval or manually-composed id) has no corresponding GroceryDB
    original_id and is skipped here."""
    out = set()
    for r in records:
        rid = r.get("id", "")
        if rid.startswith("gdb_"):
            out.add(rid[len("gdb_"):])
    return out


def check_independent_gold(independent, other, other_name):
    """The independent benchmark's labels were derived manually, never by
    running the rule engine, specifically so it could be trusted as a
    blind test set (see data/independent_gold/README.md) -- if any of its
    132 products end up in train/validation, that blindness is gone."""
    indep_oids = {r["source_product_id"] for r in independent if r.get("source") == "grocerydb"}
    other_oids = _train_val_original_ids(other)
    overlap = indep_oids & other_oids

    ok = len(overlap) == 0
    status = "PASS" if ok else "FAIL"
    print(f"[leakage] independent_gold vs {other_name}: {status} (original_id_overlap={len(overlap)})")
    if overlap:
        print(f"           overlapping GroceryDB original_ids (first 10): {sorted(overlap)[:10]}")
    return ok


def main():
    gold = load_jsonl(GOLD_PATH)
    train = load_jsonl(TRAIN_PATH)
    val = load_jsonl(VAL_PATH)
    independent_gold = load_jsonl(INDEPENDENT_GOLD_PATH) if os.path.exists(INDEPENDENT_GOLD_PATH) else []

    print(f"[leakage] gold={len(gold)} train={len(train)} validation={len(val)} independent_gold={len(independent_gold)}")
    ok1 = check(gold, train, "train")
    ok2 = check(gold, val, "validation")
    ok3 = ok4 = True
    if independent_gold:
        ok3 = check_independent_gold(independent_gold, train, "train")
        ok4 = check_independent_gold(independent_gold, val, "validation")
    else:
        print("[leakage] independent_gold.jsonl not found -- skipping that check (nothing to guard yet)")

    overall = "PASS" if (ok1 and ok2 and ok3 and ok4) else "FAIL"
    print(f"\n[leakage] OVERALL: {overall}")
    if overall != "PASS":
        sys.exit(1)


if __name__ == "__main__":
    main()
