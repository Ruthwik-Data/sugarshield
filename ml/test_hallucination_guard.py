#!/usr/bin/env python3
"""Plain-assertion tests for hallucination_guard.py (Part 11/16: reject
model-claimed sugar terms that aren't actually in the ingredient text).

Run: python3 ml/test_hallucination_guard.py
"""

import sys

from hallucination_guard import build_canonical_alias_map, filter_supported_terms, is_claim_supported

FAKE_LEXICON = [
    {"term": "hfcs", "canonical": "high fructose corn syrup"},
    {"term": "high fructose corn syrup", "canonical": "high fructose corn syrup"},
    {"term": "high-fructose corn syrup", "canonical": "high fructose corn syrup"},
    {"term": "cane sugar", "canonical": "sugar"},
    {"term": "sugar", "canonical": "sugar"},
    {"term": "maltodextrin", "canonical": "maltodextrin"},
    {"term": "stevia", "canonical": "stevia"},
]


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

    alias_map = build_canonical_alias_map(FAKE_LEXICON)

    check(
        is_claim_supported("high fructose corn syrup", "Water, HFCS, Caramel Color", alias_map),
        "an alias present in the text supports the canonical claim (hfcs -> high fructose corn syrup)",
    )
    check(
        not is_claim_supported("maltodextrin", "Water, Sugar, Natural Flavors", alias_map),
        "a claimed term with zero textual support is rejected",
    )
    check(
        is_claim_supported("sugar", "Water, Cane Sugar, Salt", alias_map),
        "a canonical name is supported when a synonym alias (cane sugar) is present",
    )
    check(
        not is_claim_supported("stevia", "Water, Maltodextrin, Citric Acid", alias_map),
        "a real, known sweetener name with no textual support is still rejected (not merely unknown terms)",
    )

    kept, dropped = filter_supported_terms(
        ["high fructose corn syrup", "maltodextrin", "stevia"],
        "Carbonated Water, High Fructose Corn Syrup, Phosphoric Acid",
        alias_map,
    )
    check(kept == ["high fructose corn syrup"], f"filter_supported_terms keeps only supported claims, got kept={kept}")
    check(
        sorted(dropped) == ["maltodextrin", "stevia"],
        f"filter_supported_terms reports every rejected (hallucinated) claim, got dropped={dropped}",
    )

    kept2, dropped2 = filter_supported_terms([], "Water, Sugar", alias_map)
    check(kept2 == [] and dropped2 == [], "an empty claim list produces no false rejections")

    print(f"\n{passed} passed, {failed} failed")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    run()
