#!/usr/bin/env python3
"""
data/scripts/clean_and_normalize.py

Cleans and deduplicates the raw GroceryDB-joined records written by
fetch_openfoodfacts.py (data/raw/grocerydb_*.json) into
data/processed/cleaned_candidates.jsonl -- one cleaned, normalized,
deduplicated candidate record per line, still carrying a *provisional*
category (final category + all sugar/risk fields are computed by
label_records.py, since some category assignments depend on the detected
sugar signals -- see grocerydb_common.refine_category_post_label).

Cleaning steps:
  - HTML-entity-unescape product names and ingredient text (GroceryDB names
    are pulled straight off retailer HTML, e.g. "Good &#38; Gather&#8482;").
  - Normalize ingredients_raw into normalized_ingredients using the same
    tokenization as lib/normalizeIngredients.ts / lib/normalizeText.ts.
  - Drop garbage: empty/too-short/too-long ingredient text, or text that's
    just digits/punctuation.
  - Dedupe by original_id, then by a size/pack-stripped (product name, brand)
    key so "Coca-Cola Zero Sugar - 12pk/12 fl oz Cans" and "...- 2L Bottle"
    collapse into one representative record instead of inflating counts with
    near-identical SKUs.
"""

import glob
import html
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(__file__))
from risk_engine import normalize_text, split_ingredients  # noqa: E402

RAW_DIR = os.path.join(os.path.dirname(__file__), "..", "raw")
OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "processed", "cleaned_candidates.jsonl")
os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)

_SIZE_PACK_RE = re.compile(
    r"\s*-\s*\d.*$|\s*\(\d.*\)\s*$", re.IGNORECASE
)


def dedup_key(name: str, brand: str) -> str:
    base = _SIZE_PACK_RE.sub("", name).strip().lower()
    base = re.sub(r"[^a-z0-9]+", " ", base).strip()
    return f"{base}|{(brand or '').strip().lower()}"


def is_garbage_ingredients(text: str) -> bool:
    if not text or len(text) < 3 or len(text) > 2000:
        return True
    letters = sum(1 for ch in text if ch.isalpha())
    if letters < 3:
        return True
    return False


def main():
    seen_ids = set()
    seen_dedup_keys = set()
    cleaned = []
    dropped_garbage = 0
    dropped_dup_id = 0
    dropped_dup_key = 0
    total_in = 0

    for fp in sorted(glob.glob(os.path.join(RAW_DIR, "grocerydb_*.json"))):
        with open(fp) as f:
            payload = json.load(f)
        for p in payload["products"]:
            total_in += 1
            oid = p["original_id"]
            name = html.unescape(p["product_name"]).strip()
            brand = html.unescape(p["brand"]).strip() if p.get("brand") else None
            ingredients_raw = html.unescape(p["ingredients_raw"]).strip()

            if is_garbage_ingredients(ingredients_raw):
                dropped_garbage += 1
                continue
            if oid in seen_ids:
                dropped_dup_id += 1
                continue

            key = dedup_key(name, brand or "")
            if key in seen_dedup_keys:
                dropped_dup_key += 1
                continue

            seen_ids.add(oid)
            seen_dedup_keys.add(key)

            normalized_ingredients = split_ingredients(ingredients_raw)

            cleaned.append({
                "id": f"gdb_{oid}",
                "product_name": name,
                "brand": brand or None,
                "provisional_category": p["mapped_category"],
                "ingredients_raw": ingredients_raw,
                "normalized_ingredients": normalized_ingredients,
                "nutrition": p["nutrition"],
                "source": "grocerydb",
                "source_url": p.get("source_url"),
            })

    with open(OUT_PATH, "w") as f:
        for rec in cleaned:
            f.write(json.dumps(rec) + "\n")

    print(f"[clean] input records: {total_in}", file=sys.stderr)
    print(f"[clean] dropped (garbage ingredients): {dropped_garbage}", file=sys.stderr)
    print(f"[clean] dropped (duplicate id): {dropped_dup_id}", file=sys.stderr)
    print(f"[clean] dropped (near-duplicate name+brand): {dropped_dup_key}", file=sys.stderr)
    print(f"[clean] kept: {len(cleaned)} -> {OUT_PATH}", file=sys.stderr)


if __name__ == "__main__":
    main()
