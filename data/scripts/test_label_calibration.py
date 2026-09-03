#!/usr/bin/env python3
"""Plain-assertion tests (no pytest) for two Fine-tune V2 Loop 2 invariants:

1. label_records.py's sweetener-only SAFE calibration override actually
   fires when (and only when) it should -- see
   _apply_sweetener_only_calibration()'s docstring for why it exists.
2. data/gold/gold.jsonl stays exactly what its own docstring promises:
   every GroceryDB-sourced record's risk_level (and everything derived
   with it) must match a FRESH, uncalibrated analyze_ingredients_text()
   call on its own ingredients_raw -- i.e. gold must never silently pick up
   the training-only calibration override. A regression here previously
   introduced 4 false positives into the "original benchmark" purely from
   build_gold_set.py copying pool records that WERE calibration-corrected.

Run: python3 data/scripts/test_label_calibration.py
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from label_records import _apply_sweetener_only_calibration  # noqa: E402
from risk_engine import analyze_ingredients_text  # noqa: E402

GOLD_PATH = os.path.join(os.path.dirname(__file__), "..", "gold", "gold.jsonl")


def run():
    passed = 0
    failed = 0

    def check(condition, message):
        nonlocal passed, failed
        if condition:
            print(f"PASS: {message}")
            passed += 1
        else:
            print(f"FAIL: {message}")
            failed += 1

    # --- calibration override ---
    sweetener_only = analyze_ingredients_text(
        "Carbonated Water, Citric Acid, Aspartame, Potassium Benzoate, Caffeine.", mode="STRICT"
    )
    check(
        sweetener_only["riskLevel"] != "SAFE",
        "sanity check: the raw rule engine does NOT call a sweetener-only product SAFE on its own "
        f"(got {sweetener_only['riskLevel']!r}) -- if this ever changes, the override below becomes a no-op",
    )
    calibrated = _apply_sweetener_only_calibration(sweetener_only)
    check(calibrated["riskLevel"] == "SAFE", "sweetener-only, zero-real-sugar product is overridden to SAFE")
    check("aspartame" in calibrated["explanation"].lower(), "override explanation names the actual sweetener")

    mixed = analyze_ingredients_text("Water, Sugar, Aspartame, Citric Acid.", mode="STRICT")
    calibrated_mixed = _apply_sweetener_only_calibration(mixed)
    check(
        calibrated_mixed["riskLevel"] == mixed["riskLevel"],
        "a product with REAL sugar present is NOT touched by the override, even with a sweetener also present",
    )

    natural_and_sweetener = analyze_ingredients_text("Milk, Stevia Extract, Natural Flavor.", mode="STRICT")
    calibrated_natural = _apply_sweetener_only_calibration(natural_and_sweetener)
    check(
        calibrated_natural["riskLevel"] == natural_and_sweetener["riskLevel"],
        "a product with natural sugar context (milk) present is NOT touched by the override either",
    )

    no_sweetener = analyze_ingredients_text("Water, Sugar, Natural Flavor.", mode="STRICT")
    calibrated_none = _apply_sweetener_only_calibration(no_sweetener)
    check(
        calibrated_none == no_sweetener or calibrated_none["riskLevel"] == no_sweetener["riskLevel"],
        "a product with no artificial sweetener at all is untouched by the override",
    )

    # --- gold.jsonl consistency invariant ---
    if os.path.exists(GOLD_PATH):
        with open(GOLD_PATH, "r", encoding="utf-8") as f:
            gold = [json.loads(line) for line in f if line.strip()]
        grocerydb_gold = [r for r in gold if r.get("source") == "grocerydb"]
        mismatches = []
        for r in grocerydb_gold:
            fresh = analyze_ingredients_text(r["ingredients_raw"], mode="STRICT")
            if fresh["riskLevel"] != r["risk_level"]:
                mismatches.append((r["id"], r["risk_level"], fresh["riskLevel"]))
        check(
            len(mismatches) == 0,
            f"every GroceryDB-sourced gold record's risk_level matches a fresh, uncalibrated rule-engine "
            f"call (checked {len(grocerydb_gold)} records)"
            + (f" -- mismatches: {mismatches[:5]}" if mismatches else ""),
        )
    else:
        print("SKIP: data/gold/gold.jsonl not found -- run the data pipeline first to check this invariant")

    print(f"\n{passed} passed, {failed} failed")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    run()
