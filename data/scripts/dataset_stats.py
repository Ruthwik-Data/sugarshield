#!/usr/bin/env python3
"""
data/scripts/dataset_stats.py

Computes and prints/saves data/processed/dataset_stats.json: total counts,
per-split counts, per-category counts, per-risk_level counts, % with
contains_hidden_sugar, % with contains_artificial_sweetener, source
breakdown (real vs manual/synthetic), verified vs unverified counts.
"""

import json
import os
from collections import Counter

BASE = os.path.join(os.path.dirname(__file__), "..")
PATHS = {
    "train": os.path.join(BASE, "train", "train.jsonl"),
    "validation": os.path.join(BASE, "validation", "validation.jsonl"),
    "gold": os.path.join(BASE, "gold", "gold.jsonl"),
}
OUT_PATH = os.path.join(BASE, "processed", "dataset_stats.json")

REAL_SOURCES = {"grocerydb", "sugarshield_v1_eval"}  # sugarshield_v1_eval ingredients are hand-written but represent the shipped product's real eval cases
SYNTHETIC_SOURCES = {"manual_gold"}


def load_jsonl(path):
    with open(path) as f:
        return [json.loads(line) for line in f if line.strip()]


def pct(n, total):
    return round(100.0 * n / total, 2) if total else 0.0


def summarize(records):
    total = len(records)
    cat_counts = dict(Counter(r["category"] for r in records))
    risk_counts = dict(Counter(r["risk_level"] for r in records))
    source_counts = dict(Counter(r["source"] for r in records))
    verified_counts = dict(Counter(r["verified"] for r in records))
    hidden = sum(1 for r in records if r["contains_hidden_sugar"])
    artificial = sum(1 for r in records if r["contains_artificial_sweetener"])
    added = sum(1 for r in records if r["contains_added_sugar"])
    natural = sum(1 for r in records if r["contains_natural_sugar"])
    real_n = sum(1 for r in records if r["source"] in REAL_SOURCES)
    synthetic_n = sum(1 for r in records if r["source"] in SYNTHETIC_SOURCES)
    return {
        "total": total,
        "category_counts": cat_counts,
        "risk_level_counts": risk_counts,
        "source_counts": source_counts,
        "verified_counts": {str(k): v for k, v in verified_counts.items()},
        "pct_contains_hidden_sugar": pct(hidden, total),
        "pct_contains_artificial_sweetener": pct(artificial, total),
        "pct_contains_added_sugar": pct(added, total),
        "pct_contains_natural_sugar": pct(natural, total),
        "real_vs_synthetic": {
            "real": real_n,
            "synthetic_manual": synthetic_n,
            "pct_real": pct(real_n, total),
        },
    }


def main():
    splits = {name: load_jsonl(path) for name, path in PATHS.items()}
    all_records = [r for recs in splits.values() for r in recs]

    stats = {
        "generated_from": {name: path for name, path in PATHS.items()},
        "split_sizes": {name: len(recs) for name, recs in splits.items()},
        "overall": summarize(all_records),
        "by_split": {name: summarize(recs) for name, recs in splits.items()},
    }

    with open(OUT_PATH, "w") as f:
        json.dump(stats, f, indent=2)

    print(json.dumps(stats, indent=2))
    print(f"\n[stats] wrote {OUT_PATH}")


if __name__ == "__main__":
    main()
