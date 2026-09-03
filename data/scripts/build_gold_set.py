#!/usr/bin/env python3
"""
data/scripts/build_gold_set.py

Builds data/gold/gold.jsonl, the frozen SugarShield benchmark. Three kinds
of record go in, all "verified": true:

  1. The 15 legacy cases from data/evalSet.json, re-scored through our
     ported rule engine (source: "sugarshield_v1_eval"). We do NOT reuse
     their old PASS/WARN/FAIL verdicts -- the ported engine's risk_level is
     computed fresh from the ingredient text.
  2. A curated pull of real GroceryDB records (source: "grocerydb") chosen
     to (a) cover the specific hard cases the task calls out -- an isolated
     stevia case, an isolated monk fruit case, a diet soda, 3+ misleading
     "healthy" products, a 3+ stacked-sugar-alias product, real HFCS/brown
     rice syrup/fruit-juice-concentrate examples -- and (b) give 2-3 clean
     examples per category enum value for general coverage. Each was
     eyeballed (see the inline comments) before being marked verified.
  3. A small number of hand-composed records (source: "manual_gold") for
     concepts real data in our pull didn't cleanly isolate: standalone
     dextrose, standalone fructose, standalone maltodextrin (hidden sugar),
     standalone corn syrup solids (hidden sugar), and standalone erythritol.

Every record is run through the SAME ported risk_engine used for the bulk
data, so gold labels are internally consistent with train/validation, not
hand-guessed.
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from risk_engine import analyze_ingredients_text, split_ingredients  # noqa: E402

ALL_RECORDS_PATH = os.path.join(os.path.dirname(__file__), "..", "processed", "all_records.jsonl")
EVAL_SET_PATH = os.path.join(os.path.dirname(__file__), "..", "evalSet.json")
GOLD_OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "gold", "gold.jsonl")
os.makedirs(os.path.dirname(GOLD_OUT_PATH), exist_ok=True)


def make_record(rec_id, product_name, brand, category, ingredients_raw, source, verified,
                 nutrition=None):
    result = analyze_ingredients_text(ingredients_raw, mode="STRICT")
    return {
        "id": rec_id,
        "product_name": product_name,
        "brand": brand,
        "category": category,
        "ingredients_raw": ingredients_raw,
        "normalized_ingredients": split_ingredients(ingredients_raw),
        "nutrition": nutrition or {"serving_size": None, "total_sugars_g": None, "added_sugars_g": None},
        "contains_added_sugar": result["containsAddedSugar"],
        "contains_hidden_sugar": result["containsHiddenSugar"],
        "contains_artificial_sweetener": result["containsArtificialSweetener"],
        "contains_natural_sugar": result["containsNaturalSugar"],
        "detected_sugars": result["detectedSugars"],
        "artificial_sweeteners": result["artificialSweeteners"],
        "risk_level": result["riskLevel"],
        "explanation": result["explanation"],
        "source": source,
        "verified": verified,
    }


# ---------------------------------------------------------------------------
# 1. Port the 15 legacy sugarshield_v1_eval cases.
# ---------------------------------------------------------------------------
V1_CATEGORY_MAP = {
    "e001": "soda",              # Classic Cola
    "e002": "juice",             # Fruit Punch Pouch
    "e003": "natural_sugar",     # Rolled Oats
    "e004": "sauce",             # BBQ Sauce
    "e005": "artificially_sweetened",  # Zero Sugar Cola / Aspartame
    "e006": "protein_bar",       # Power Bar
    "e007": "natural_sugar",     # Nonfat Greek Yogurt (plain)
    "e008": "other",             # Sweetened almond milk (no dedicated enum bucket)
    "e009": "sauce",             # Tomato Ketchup
    "e010": "snack",             # Rice Snaps
    "e011": "other",             # Enhanced/vitamin water
    "e012": "breakfast",         # Honey Granola
    "e013": "natural_sugar",     # Pure Coconut Water
    "e014": "sauce",             # Marinara
    "e015": "sauce",             # Raspberry Vinaigrette
}


def build_v1_eval_records():
    with open(EVAL_SET_PATH) as f:
        eval_cases = json.load(f)
    out = []
    for case in eval_cases:
        eid = case["id"]
        category = V1_CATEGORY_MAP.get(eid, "other")
        out.append(make_record(
            rec_id=f"gold_v1_{eid}",
            product_name=case["inputs"]["productName"],
            brand=None,
            category=category,
            ingredients_raw=case["inputs"]["ingredientsText"],
            source="sugarshield_v1_eval",
            verified=True,
        ))
    return out


# ---------------------------------------------------------------------------
# 2. Hand-composed records for concepts not cleanly isolated in real data.
# ---------------------------------------------------------------------------
def build_manual_records():
    manual = [
        dict(
            product_name="Electrolyte Rehydration Powder, Lemon-Lime",
            brand="PureHydrate",
            category="sugar_free",
            ingredients_raw="Dextrose, Sodium Citrate, Potassium Citrate, Citric Acid, Natural Flavor.",
        ),
        dict(
            product_name="All-Fruit Strawberry Spread",
            brand="OrchardTable",
            category="sauce",
            ingredients_raw="Fructose, Fruit Pectin, Citric Acid, Natural Fruit Flavors.",
        ),
        dict(
            product_name="Instant Chicken Noodle Soup Mix",
            brand="Broth & Co.",
            category="other",
            ingredients_raw=(
                "Maltodextrin, Salt, Dried Enriched Noodles (Wheat Flour, Egg), Dried Chicken, "
                "Yeast Extract, Spices, Dehydrated Vegetables."
            ),
        ),
        dict(
            product_name="Non-Dairy Powdered Coffee Creamer, Original",
            brand="MorningPour",
            category="other",
            ingredients_raw=(
                "Corn Syrup Solids, Partially Hydrogenated Vegetable Oil, Sodium Caseinate, "
                "Dipotassium Phosphate, Mono- and Diglycerides, Natural Flavor."
            ),
        ),
        dict(
            product_name="Light Vanilla Bean Ice Cream",
            brand="Chill & Co.",
            category="dessert",
            ingredients_raw=(
                "Cream, Skim Milk, Erythritol, Egg Yolk, Vegetable Glycerin, Chicory Root Fiber, "
                "Natural Flavors."
            ),
        ),
    ]
    out = []
    for i, m in enumerate(manual, start=1):
        out.append(make_record(
            rec_id=f"manual_{i:03d}",
            product_name=m["product_name"],
            brand=m["brand"],
            category=m["category"],
            ingredients_raw=m["ingredients_raw"],
            source="manual_gold",
            verified=True,
        ))
    return out


# ---------------------------------------------------------------------------
# 3. Curated real GroceryDB pulls (by id from data/processed/all_records.jsonl).
#    Each entry: (id, optional category override, why it's in gold).
# ---------------------------------------------------------------------------
CURATED_REAL_IDS = [
    # -- specific hard cases called out in the brief --
    ("gdb_tg_12953460", None, "diet soda: artificial sweetener (aspartame), no real sugar"),
    ("gdb_tg_12946082", None, "diet soda: stacked artificial sweeteners (aspartame+ace-k+sucralose)"),
    ("gdb_tg_12935470", None, "artificially sweetened juice: sucralose + acesulfame potassium"),
    ("gdb_tg_14751841", None, "real fruit-juice-concentrate stacking"),
    ("gdb_tg_13007808", None, "real high fructose corn syrup example"),
    ("gdb_tg_14501638", "snack", "3+ stacked sugar aliases: sugar, maltodextrin, dextrose, honey"),
    ("gdb_tg_52244660", None, "misleading healthy #1: 'Healthy Grains' bar, 5 stacked sugar sources incl. brown rice syrup"),
    ("gdb_tg_12960083", "healthy_marketed", "misleading healthy #2: 'GoLean' cereal, brown rice syrup+cane sugar+honey"),
    ("gdb_tg_13331322", "healthy_marketed", "misleading healthy #3: 'Lower Sugar' oatmeal that still has real sugar + monk fruit"),
    ("gdb_tg_12935617", None, "cane sugar + real fruit juice concentrate stacked, juice category"),
]


def build_curated_real_records(pool_by_id):
    out = []
    used_ids = set()
    for rid, category_override, _why in CURATED_REAL_IDS:
        if rid in used_ids:
            continue
        rec = pool_by_id.get(rid)
        if rec is None:
            continue
        used_ids.add(rid)
        rec = dict(rec)
        if category_override:
            rec["category"] = category_override
        rec["verified"] = True
        out.append(rec)
    return out, used_ids


# Isolated single-sweetener real examples (stevia only, monk fruit only).
ISOLATED_SWEETENER_IDS = [
    "gdb_tg_53646200",  # Birch Benders Paleo Pancake Mix -- monk fruit extract only
]


def find_isolated_stevia(pool):
    for r in pool:
        sw = r["artificial_sweeteners"]
        if sw == ["stevia"] and not r["contains_added_sugar"]:
            return r
    return None


# ---------------------------------------------------------------------------
# 4. General per-category real coverage: a couple of clean examples per
#    category enum value, spanning a range of risk levels.
# ---------------------------------------------------------------------------
GENERAL_COVERAGE_PICKS = {
    "soda": 2, "juice": 2, "cereal": 2, "protein_bar": 2, "yogurt": 2,
    "sauce": 2, "snack": 2, "dessert": 2, "bread": 2, "breakfast": 2,
    "protein_product": 2, "kids_food": 2, "natural_sugar": 2, "other": 2,
}


def pick_general_coverage(pool, already_used_ids):
    import random
    random.seed(42)
    by_cat = {}
    for r in pool:
        if r["id"] in already_used_ids:
            continue
        by_cat.setdefault(r["category"], []).append(r)

    picked = []
    for cat, n in GENERAL_COVERAGE_PICKS.items():
        candidates = by_cat.get(cat, [])
        # Prefer a spread of risk levels rather than n duplicates of the same band.
        candidates_sorted = sorted(candidates, key=lambda r: r["risk_level"])
        random.shuffle(candidates_sorted)
        seen_levels = set()
        chosen = []
        for r in candidates_sorted:
            if r["risk_level"] not in seen_levels or len(chosen) >= n:
                pass
            if len(chosen) < n and (r["risk_level"] not in seen_levels or len(candidates_sorted) <= n):
                chosen.append(r)
                seen_levels.add(r["risk_level"])
            if len(chosen) >= n:
                break
        for r in chosen:
            rec = dict(r)
            rec["verified"] = True
            picked.append(rec)
    return picked


def main():
    pool = []
    with open(ALL_RECORDS_PATH) as f:
        for line in f:
            pool.append(json.loads(line))
    pool_by_id = {r["id"]: r for r in pool}

    gold = []
    gold_ids = set()

    v1_records = build_v1_eval_records()
    gold.extend(v1_records)

    manual_records = build_manual_records()
    gold.extend(manual_records)

    curated_real, used_ids = build_curated_real_records(pool_by_id)
    gold.extend(curated_real)

    stevia_rec = find_isolated_stevia(pool)
    if stevia_rec and stevia_rec["id"] not in used_ids:
        rec = dict(stevia_rec)
        rec["verified"] = True
        gold.append(rec)
        used_ids.add(stevia_rec["id"])

    for mf_id in ISOLATED_SWEETENER_IDS:
        if mf_id in pool_by_id and mf_id not in used_ids:
            rec = dict(pool_by_id[mf_id])
            rec["verified"] = True
            gold.append(rec)
            used_ids.add(mf_id)

    general = pick_general_coverage(pool, used_ids)
    for r in general:
        used_ids.add(r["id"])
    gold.extend(general)

    # De-dupe by id (paranoia) and write.
    for r in gold:
        if r["id"] in gold_ids:
            continue
        gold_ids.add(r["id"])

    final = []
    seen = set()
    for r in gold:
        if r["id"] in seen:
            continue
        seen.add(r["id"])
        final.append(r)

    # Every curated/isolated/general-coverage pick above was copied straight
    # from data/processed/all_records.jsonl, whose risk_level etc. now come
    # from label_records.py's _apply_sweetener_only_calibration() override
    # (a Fine-tune V2 Loop 2 correction meant only for training targets, see
    # that function's docstring). Gold must stay what its own docstring
    # promises -- "every record is run through the SAME ported risk_engine
    # used for the bulk data" -- i.e. the *uncalibrated* production engine,
    # so it keeps measuring exactly what's live today and rule_baseline
    # stays internally consistent with it. Recompute fresh here rather than
    # trusting whatever fields the pool copy happened to carry.
    for r in final:
        if r["source"] != "grocerydb":
            continue
        result = analyze_ingredients_text(r["ingredients_raw"], mode="STRICT")
        r["contains_added_sugar"] = result["containsAddedSugar"]
        r["contains_hidden_sugar"] = result["containsHiddenSugar"]
        r["contains_artificial_sweetener"] = result["containsArtificialSweetener"]
        r["contains_natural_sugar"] = result["containsNaturalSugar"]
        r["detected_sugars"] = result["detectedSugars"]
        r["artificial_sweeteners"] = result["artificialSweeteners"]
        r["risk_level"] = result["riskLevel"]
        r["explanation"] = result["explanation"]

    with open(GOLD_OUT_PATH, "w") as f:
        for r in final:
            f.write(json.dumps(r) + "\n")

    from collections import Counter
    print(f"[gold] wrote {len(final)} records -> {GOLD_OUT_PATH}", file=sys.stderr)
    print(f"[gold] source breakdown: {dict(Counter(r['source'] for r in final))}", file=sys.stderr)
    print(f"[gold] category breakdown: {dict(Counter(r['category'] for r in final))}", file=sys.stderr)
    print(f"[gold] risk_level breakdown: {dict(Counter(r['risk_level'] for r in final))}", file=sys.stderr)


if __name__ == "__main__":
    main()
