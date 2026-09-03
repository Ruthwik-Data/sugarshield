#!/usr/bin/env python3
"""
data/scripts/fetch_openfoodfacts.py

Fetches REAL, bulk grocery-product data for the SugarShield dataset.

SOURCE NOTE (read this first): this script's original design targeted the
Open Food Facts REST search API (world.openfoodfacts.org). That hostname is
blocked outright by this environment's network egress policy (every request,
including a bare HEAD, is rejected by the proxy with a policy 403 -- verified
via curl, Python requests, and the WebFetch tool; also confirmed that
*.openfoodfacts.org, openfoodfacts.github.io, huggingface.co, wikipedia.org
and kaggle.com are all blocked the same way). `git clone` against public
GitHub repos, and plain HTTPS GETs to raw.githubusercontent.com, ARE
reachable from this environment, so this script instead pulls real product
data from **GroceryDB** (github.com/Barabasi-Lab/GroceryDB, MIT license):
50,638 real products scraped from Target, Walmart, and Whole Foods, published
by the Barabási Lab (Northeastern University) alongside their Nature Food /
Nature Communications papers on food processing and nutrition. See
data/README.md for full citation and licensing detail.

This script:
  1. `git clone --depth 1`s GroceryDB into a scratch directory (not committed
     into this repo -- only the records we select are written to data/raw/).
  2. Unzips data/UpdatedProductIngredients_11_15.zip (the real per-product
     ingredient trees; GroceryDB_foods.csv alone has no ingredient text).
  3. Joins the two files on `original_ID`.
  4. Reconstructs a realistic ingredients_raw string by walking each
     ingredient_tree in `order`, rendering any sub_ingredients recursively in
     parentheses (mirrors how a real nutrition label lists sub-ingredients).
  5. Maps GroceryDB's "harmonized single category" onto the SugarShield
     category enum (see grocerydb_common.py) and writes capped, per-category
     raw JSON files under data/raw/, each carrying a provenance header.

No synthetic fallback: if the clone or the join fails, this script raises
rather than fabricating data.
"""

import csv
import json
import os
import subprocess
import sys
import zipfile
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(__file__))
from grocerydb_common import (  # noqa: E402
    classify_grocerydb_category, flatten_ingredient_tree, count_leaf_ingredients,
)

REPO_URL = "https://github.com/Barabasi-Lab/GroceryDB.git"
SCRATCH_DIR = os.environ.get(
    "SUGARSHIELD_SCRATCH",
    "/tmp/claude-0/-home-user-sugarshield/a1631807-94dd-58d3-8806-7369ddbcb581/scratchpad",
)
CLONE_DIR = os.path.join(SCRATCH_DIR, "GroceryDB")
UNZIP_DIR = os.path.join(SCRATCH_DIR, "unzipped")
INGREDIENTS_JSON = os.path.join(UNZIP_DIR, "UpdatedProductIngredients_11_15.json")
FOODS_CSV = os.path.join(CLONE_DIR, "data", "GroceryDB_foods.csv")

RAW_DIR = os.path.join(os.path.dirname(__file__), "..", "raw")
os.makedirs(RAW_DIR, exist_ok=True)

INDEPENDENT_GOLD_PATH = os.path.join(os.path.dirname(__file__), "..", "independent_gold", "independent_gold.jsonl")


def load_independent_gold_original_ids():
    """The 132-record independent benchmark must stay frozen and never be
    trained on (see data/independent_gold/README.md). Its labels were
    derived manually specifically so it could serve as a blind test set --
    pulling any of its underlying GroceryDB products into train/validation
    would quietly destroy that. Excluded here, at the source, rather than
    relying on catching it after the fact in detect_leakage.py."""
    if not os.path.exists(INDEPENDENT_GOLD_PATH):
        return set()
    ids = set()
    with open(INDEPENDENT_GOLD_PATH, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rec = json.loads(line)
            if rec.get("source") == "grocerydb" and rec.get("source_product_id"):
                ids.add(rec["source_product_id"])
    return ids

# Per-category cap on how many joined+cleaned records we keep. "other" gets a
# modest allocation too, for diversity, but is capped low so it can't dominate.
#
# Fine-tune V2 (Loop 2): raised substantially from v1's caps (all 60-140) to
# grow the training pool from ~1,300 toward the 5,000-20,000 target range.
# Categories tied to Loop 1's observed failure buckets get extra weight:
# sugar_free/artificially_sweetened (the "artificial sweetener only = SAFE"
# calibration gap -- 7 of 9 independent-benchmark false positives), juice
# and natural_sugar (fruit-concentrate/dried-fruit-paste natural-vs-added
# ambiguity), healthy_marketed (misleading-claims cases).
CAPS = {
    "soda": 600, "juice": 700, "cereal": 600, "protein_bar": 350, "yogurt": 600,
    "sauce": 600, "snack": 700, "dessert": 700, "bread": 500, "breakfast": 500,
    "protein_product": 500, "kids_food": 350, "healthy_marketed": 400,
    "sugar_free": 400, "artificially_sweetened": 400, "natural_sugar": 700,
    "other": 400,
}
# NOTE: healthy_marketed / sugar_free / artificially_sweetened always fetch 0
# here -- classify_grocerydb_category() (above) never assigns those three;
# they're only assigned later by grocerydb_common.refine_category_post_label()
# in label_records.py, once sugar/sweetener content is actually known. Their
# CAPS entries are harmless no-ops at fetch time, kept only so the per-category
# bucket exists; getting more of them means raising the *source* categories
# they get refined from (soda/juice/snack/other/etc., raised above), not these.


def ensure_source():
    if not os.path.isdir(os.path.join(CLONE_DIR, ".git")):
        print(f"[fetch] cloning {REPO_URL} -> {CLONE_DIR}", file=sys.stderr)
        os.makedirs(SCRATCH_DIR, exist_ok=True)
        subprocess.run(["git", "clone", "--depth", "1", REPO_URL, CLONE_DIR], check=True)
    else:
        print(f"[fetch] reusing existing clone at {CLONE_DIR}", file=sys.stderr)

    if not os.path.isfile(INGREDIENTS_JSON):
        print("[fetch] unzipping UpdatedProductIngredients_11_15.zip", file=sys.stderr)
        os.makedirs(UNZIP_DIR, exist_ok=True)
        zip_path = os.path.join(CLONE_DIR, "data", "UpdatedProductIngredients_11_15.zip")
        with zipfile.ZipFile(zip_path) as zf:
            zf.extractall(UNZIP_DIR)
    else:
        print("[fetch] reusing already-unzipped ingredients JSON", file=sys.stderr)


def load_ingredients_index():
    print("[fetch] loading ingredient trees (this is a ~325MB JSON array)...", file=sys.stderr)
    with open(INGREDIENTS_JSON, "r", encoding="utf-8") as f:
        records = json.load(f)
    index = {}
    for rec in records:
        oid = rec.get("original_ID")
        if oid:
            index[oid] = rec
    print(f"[fetch] loaded {len(index)} ingredient-tree records", file=sys.stderr)
    return index


def to_float(s):
    if s is None or s == "" or s == "NA" or s == "N/A":
        return None
    try:
        return round(float(s), 3)
    except ValueError:
        return None


def main():
    ensure_source()
    ing_index = load_ingredients_index()
    excluded_oids = load_independent_gold_original_ids()
    print(f"[fetch] excluding {len(excluded_oids)} GroceryDB original_ids already used by the frozen independent benchmark", file=sys.stderr)

    buckets = {cat: [] for cat in CAPS}
    scanned = 0
    joined = 0
    excluded_hits = 0

    with open(FOODS_CSV, newline="", encoding="utf-8", errors="replace") as f:
        reader = csv.reader(f)
        header = next(reader)
        assert header[0] == "original_ID"
        for row in reader:
            scanned += 1
            if len(row) < 27:
                continue
            oid, name, store, harmonized_category, brand = row[0], row[1], row[2], row[3], row[4]
            if not oid or not name:
                continue
            if oid in excluded_oids:
                excluded_hits += 1
                continue

            ing_rec = ing_index.get(oid)
            if not ing_rec:
                continue
            tree = ing_rec.get("ingredient_tree") or []
            if count_leaf_ingredients(tree) < 1:
                continue
            ingredients_raw = flatten_ingredient_tree(tree)
            if len(ingredients_raw) < 3:
                continue

            category = classify_grocerydb_category(harmonized_category, name)
            if category not in buckets or len(buckets[category]) >= CAPS[category]:
                continue

            sugars_total = to_float(row[18]) if len(row) > 18 else None
            protein = to_float(row[15]) if len(row) > 15 else None

            record = {
                "original_id": oid,
                "product_name": name.strip(),
                "brand": (brand or "").strip() or None,
                "store": store,
                "harmonized_category": harmonized_category,
                "mapped_category": category,
                "ingredients_raw": ingredients_raw,
                "nutrition": {
                    "serving_size": "100g",  # GroceryDB nutrition columns are per 100g
                    "total_sugars_g": sugars_total,
                    "added_sugars_g": None,  # not provided by GroceryDB
                    "proteins_g_100g": protein,
                },
                "source_url": ing_rec.get("url"),
            }
            buckets[category].append(record)
            joined += 1

            if scanned % 5000 == 0:
                print(f"[fetch] scanned={scanned} joined={joined}", file=sys.stderr)

    manifest = {
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "source_repo": REPO_URL,
        "source_license": "MIT",
        "source_note": (
            "GroceryDB (Barabasi Lab, Northeastern University): 50,638 real products "
            "scraped from Target, Walmart, and Whole Foods. Fetched via a real "
            "'git clone' of the public repository. Substituted for the Open Food "
            "Facts REST API, which is blocked by this environment's network egress "
            "policy (world.openfoodfacts.org is unreachable here)."
        ),
        "rows_scanned": scanned,
        "rows_joined": joined,
        "buckets": {},
    }

    for category, records in buckets.items():
        out_path = os.path.join(RAW_DIR, f"grocerydb_{category}.json")
        payload = {
            "provenance": {
                "source": "grocerydb",
                "source_repo": REPO_URL,
                "source_license": "MIT",
                "mapped_category": category,
                "fetched_at": datetime.now(timezone.utc).isoformat(),
                "count": len(records),
            },
            "products": records,
        }
        with open(out_path, "w") as fh:
            json.dump(payload, fh)
        manifest["buckets"][category] = len(records)
        print(f"[fetch]   category={category} -> {len(records)} records -> {out_path}", file=sys.stderr)

    with open(os.path.join(RAW_DIR, "manifest.json"), "w") as fh:
        json.dump(manifest, fh, indent=2)

    print(f"\n[fetch] excluded (already in frozen independent benchmark): {excluded_hits}", file=sys.stderr)
    print(f"[fetch] TOTAL joined+kept (pre-clean): {joined}", file=sys.stderr)


if __name__ == "__main__":
    main()
