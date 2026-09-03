#!/usr/bin/env python3
"""
data/independent_gold/check_no_overlap.py

Hard PASS/FAIL check that independent_gold.jsonl shares zero products with
the existing train/validation/gold splits.

Checks three things:
  1. Record `id` collisions (should be structurally impossible: "indep_*"
     vs "gdb_*"/"gold_v1_*"/"manual_*", but checked anyway).
  2. Underlying GroceryDB `original_ID` collisions -- the check that
     actually matters, since a train/validation/gold record's id is
     "gdb_<original_id>" while an independent_gold record carries the same
     original_id in its own `source_product_id` field. This is the read
     that proves the two datasets were built from disjoint GroceryDB rows.
  3. Case-insensitive `product_name` collisions, as a final belt-and-braces
     check in case the same product was pulled under two different
     GroceryDB row ids (e.g. a duplicate listing across two stores).

Exits 0 and prints PASS on success; exits 1 and prints FAIL with the
offending overlap otherwise.
"""
import json
import os
import sys

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
EXISTING_FILES = [
    os.path.join(REPO_ROOT, "data", "train", "train.jsonl"),
    os.path.join(REPO_ROOT, "data", "validation", "validation.jsonl"),
    os.path.join(REPO_ROOT, "data", "gold", "gold.jsonl"),
]
INDEPENDENT_FILE = os.path.join(REPO_ROOT, "data", "independent_gold", "independent_gold.jsonl")


def load_jsonl(path):
    records = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            records.append(json.loads(line))
    return records


def main():
    existing_ids = set()
    existing_original_ids = set()
    existing_names = set()

    for path in EXISTING_FILES:
        for r in load_jsonl(path):
            rid = r.get("id", "")
            existing_ids.add(rid)
            if rid.startswith("gdb_"):
                existing_original_ids.add(rid[len("gdb_"):])
            name = (r.get("product_name") or "").strip().lower()
            if name:
                existing_names.add(name)

    independent = load_jsonl(INDEPENDENT_FILE)

    new_ids = set()
    new_original_ids = set()
    new_names = set()
    for r in independent:
        new_ids.add(r.get("id", ""))
        name = (r.get("product_name") or "").strip().lower()
        if name:
            new_names.add(name)
        if r.get("source") == "grocerydb":
            spid = r.get("source_product_id")
            if spid:
                new_original_ids.add(spid)

    id_overlap = existing_ids & new_ids
    original_id_overlap = existing_original_ids & new_original_ids
    name_overlap = existing_names & new_names

    failures = []
    if id_overlap:
        failures.append(f"record `id` overlap ({len(id_overlap)}): {sorted(id_overlap)[:20]}")
    if original_id_overlap:
        failures.append(
            f"underlying GroceryDB original_ID overlap ({len(original_id_overlap)}): "
            f"{sorted(original_id_overlap)[:20]}"
        )
    if name_overlap:
        failures.append(f"product_name overlap ({len(name_overlap)}): {sorted(name_overlap)[:20]}")

    print(f"independent_gold.jsonl records: {len(independent)}")
    print(f"existing train+validation+gold records: {len(existing_ids)}")
    print(f"existing GroceryDB original_IDs used: {len(existing_original_ids)}")
    print(f"independent_gold GroceryDB original_IDs used: {len(new_original_ids)}")

    if failures:
        print("\nFAIL -- overlap detected:")
        for f in failures:
            print(f"  - {f}")
        sys.exit(1)

    print("\nPASS -- zero overlap on id, GroceryDB original_ID, and product_name.")
    sys.exit(0)


if __name__ == "__main__":
    main()
