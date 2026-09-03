"""Rejects model-claimed sugar/sweetener terms that don't actually appear in
the input ingredient text (Part 11: "never let the model invent an
ingredient that is not present in the input").

A fine-tuned model's `detected_sugars`/`artificial_sweeteners` output is
free-form text generation — nothing stops it from naming a term that isn't
actually in the product's ingredient list. This module checks every claimed
canonical term against the SAME lexicon alias data the deterministic engine
uses (data/scripts/lexicon.py's LEXICON, via risk_engine's canonical grouping)
and drops any claim whose canonical name has no matching alias present
(word-boundary, case-insensitive) in the actual ingredient text.

This does not call analyze_ingredients_text() or otherwise re-run the rule
engine's own detection — it only checks whether the model's claim is
textually supportable, using the lexicon purely as a canonical<->alias
lookup table.
"""

import re


def build_canonical_alias_map(lexicon):
    """{"high fructose corn syrup": {"hfcs", "high fructose corn syrup", "high-fructose corn syrup"}, ...}"""
    mapping = {}
    for entry in lexicon:
        mapping.setdefault(entry["canonical"].lower(), set()).add(entry["term"].lower())
    return mapping


def _normalize(text):
    return (text or "").lower()


def is_claim_supported(claimed_term, ingredients_raw, canonical_alias_map):
    """True if `claimed_term` (a canonical name or any free-form string the
    model produced) has textual support in ingredients_raw: either one of
    its known aliases appears, or the claimed string itself appears
    verbatim (covers models that echo an alias not in our canonical map,
    or a genuinely novel-but-real term we haven't catalogued)."""
    text = _normalize(ingredients_raw)
    claimed_lower = _normalize(claimed_term)
    if not claimed_lower:
        return False

    aliases = canonical_alias_map.get(claimed_lower, {claimed_lower})
    for alias in aliases:
        if re.search(r"\b" + re.escape(alias) + r"\b", text):
            return True
    return False


def filter_supported_terms(claimed_terms, ingredients_raw, canonical_alias_map):
    """Returns (kept, dropped) — dropped terms had no textual support and
    must never reach a hybrid result or a production response."""
    kept, dropped = [], []
    for term in claimed_terms or []:
        if is_claim_supported(term, ingredients_raw, canonical_alias_map):
            kept.append(term)
        else:
            dropped.append(term)
    return kept, dropped
