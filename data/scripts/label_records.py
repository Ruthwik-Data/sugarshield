#!/usr/bin/env python3
"""
data/scripts/label_records.py

Reads data/processed/cleaned_candidates.jsonl and silver-labels every
record with the ported deterministic rule engine (data/scripts/risk_engine.py
+ lexicon.py, a faithful Python port of lib/riskEngine.ts + lib/lexicon.ts,
STRICT mode -- the current live default). This is distillation / silver
labeling, NOT independent human verification: every record produced here
gets "verified": false and "source": "grocerydb". See data/README.md.

Also finalizes each record's `category`: some SugarShield category-enum
buckets (sugar_free, artificially_sweetened, healthy_marketed, and the
"plain/unsweetened only" half of natural_sugar) are cross-cutting properties
that can only be decided once we know the detected sugar signals, so that
reassignment (grocerydb_common.refine_category_post_label) happens here,
after running the risk engine, not in clean_and_normalize.py.

Writes data/processed/all_records.jsonl, one JSON object per line, matching
the SugarShield dataset record schema exactly.
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from risk_engine import analyze_ingredients_text  # noqa: E402
from grocerydb_common import refine_category_post_label  # noqa: E402

IN_PATH = os.path.join(os.path.dirname(__file__), "..", "processed", "cleaned_candidates.jsonl")
OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "processed", "all_records.jsonl")

VALID_CATEGORIES = {
    "soda", "juice", "cereal", "protein_bar", "yogurt", "sauce", "snack",
    "dessert", "bread", "breakfast", "protein_product", "kids_food",
    "healthy_marketed", "sugar_free", "artificially_sweetened",
    "natural_sugar", "other",
}


def _apply_sweetener_only_calibration(result: dict) -> dict:
    """Fine-tune V2 Loop 1 finding: STRICT mode's rule engine scores a
    product containing ONLY artificial/plant sweeteners (aspartame,
    sucralose, stevia, ...) as LOW/MODERATE/VERY_HIGH purely from sweetener
    weighting, even when it contains zero real sugar of any kind (no added,
    hidden, or natural sugar). Measured against the independently-labeled
    132-record benchmark, this was the single largest, most consistent
    failure pattern: 7 of 9 rule-engine false positives were exactly this
    case (diet sodas, sugar-free syrups, stevia drops) -- the independent
    labelers score these SAFE, since the dataset's question is specifically
    "is there real sugar here", not "is this sweetener healthy".

    This override applies ONLY here, to the silver labels used as fine-
    tuning targets -- it does not touch lib/riskEngine.ts or
    risk_engine.py's analyze_ingredients_text(), which stay exactly as
    they score live production traffic today. Training the model on the
    rule engine's own miscalibration on this pattern would just teach it
    to repeat the same false positives; training it on the empirically
    better-calibrated label lets the model actually improve on this known
    gap instead of imitating it.
    """
    has_any_real_sugar = result["containsAddedSugar"] or result["containsHiddenSugar"] or result["containsNaturalSugar"]
    if not has_any_real_sugar and result["containsArtificialSweetener"] and result["riskLevel"] != "SAFE":
        result = dict(result)
        result["riskLevel"] = "SAFE"
        sweeteners = ", ".join(result["artificialSweeteners"][:3]) or "a non-nutritive sweetener"
        result["explanation"] = (
            f"No added, hidden, or natural sugar detected — sweetened solely with {sweeteners}. "
            "Flagged SAFE on the sugar-specific question this product measures."
        )
    return result


def label_one(cand: dict) -> dict:
    result = analyze_ingredients_text(cand["ingredients_raw"], mode="STRICT")
    result = _apply_sweetener_only_calibration(result)

    final_category = refine_category_post_label(
        cand["provisional_category"],
        cand["product_name"],
        result["containsAddedSugar"],
        result["containsArtificialSweetener"],
        len(result["detectedSugars"]),
    )
    if final_category not in VALID_CATEGORIES:
        final_category = "other"

    return {
        "id": cand["id"],
        "product_name": cand["product_name"],
        "brand": cand["brand"],
        "category": final_category,
        "ingredients_raw": cand["ingredients_raw"],
        "normalized_ingredients": cand["normalized_ingredients"],
        "nutrition": {
            "serving_size": cand["nutrition"].get("serving_size"),
            "total_sugars_g": cand["nutrition"].get("total_sugars_g"),
            "added_sugars_g": cand["nutrition"].get("added_sugars_g"),
        },
        "contains_added_sugar": result["containsAddedSugar"],
        "contains_hidden_sugar": result["containsHiddenSugar"],
        "contains_artificial_sweetener": result["containsArtificialSweetener"],
        "contains_natural_sugar": result["containsNaturalSugar"],
        "detected_sugars": result["detectedSugars"],
        "artificial_sweeteners": result["artificialSweeteners"],
        "risk_level": result["riskLevel"],
        "explanation": result["explanation"],
        "source": "grocerydb",
        "verified": False,
    }


def main():
    labeled = []
    with open(IN_PATH) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            cand = json.loads(line)
            labeled.append(label_one(cand))

    with open(OUT_PATH, "w") as f:
        for rec in labeled:
            f.write(json.dumps(rec) + "\n")

    # Quick category / risk_level breakdown for visibility.
    from collections import Counter
    cat_counts = Counter(r["category"] for r in labeled)
    risk_counts = Counter(r["risk_level"] for r in labeled)

    print(f"[label] labeled {len(labeled)} records -> {OUT_PATH}", file=sys.stderr)
    print(f"[label] category breakdown: {dict(cat_counts)}", file=sys.stderr)
    print(f"[label] risk_level breakdown: {dict(risk_counts)}", file=sys.stderr)


if __name__ == "__main__":
    main()
