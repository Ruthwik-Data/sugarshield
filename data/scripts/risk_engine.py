# data/scripts/risk_engine.py
#
# Faithful Python port of lib/normalizeText.ts, lib/normalizeIngredients.ts,
# and lib/riskEngine.ts (STRICT mode only — that is the current live default).
# Used to silver-label bulk Open Food Facts records with the same
# deterministic logic the live SugarShield product uses. See data/README.md
# for why this is "silver labeling" / distillation, not independent human
# verification.

import re

from lexicon import LEXICON_BY_LENGTH

_NON_ALNUM_RE = re.compile(r"[^a-z0-9\s]")
_CTRL_RE = re.compile(r"[\x00-\x1f]")
_WS_RE = re.compile(r"\s+")


def normalize_text(s: str) -> str:
    """Port of lib/normalizeText.ts"""
    if s is None:
        s = ""
    s = s.lower()
    s = _CTRL_RE.sub(" ", s)
    s = _NON_ALNUM_RE.sub(" ", s)
    s = _WS_RE.sub(" ", s)
    return s.strip()


def split_ingredients(raw: str):
    """Port of lib/normalizeIngredients.ts splitIngredients()"""
    if not raw:
        return []
    flattened = raw.replace("(", ",").replace(")", ",")
    if flattened.endswith("."):
        flattened = flattened[:-1]
    parts = re.split(r"[,;]", flattened)
    out = []
    for part in parts:
        norm = normalize_text(part)
        if len(norm) > 0:
            out.append(norm)
    return out


def normalize_ingredients(raw: str):
    return {"raw": raw or "", "list": split_ingredients(raw or "")}


def _escape_regex(s: str) -> str:
    return re.escape(s)


# Pre-compile word-boundary regexes for every lexicon entry, longest-term-first.
_COMPILED = [
    (entry, re.compile(r"\b" + _escape_regex(entry["term"]) + r"\b"))
    for entry in LEXICON_BY_LENGTH
]


def match_token(token: str):
    for entry, rx in _COMPILED:
        if rx.search(token):
            return entry
    return None


def detect_matches(ingredient_list):
    matches = []
    for index, token in enumerate(ingredient_list):
        entry = match_token(token)
        if entry:
            matches.append({
                "term": entry["term"],
                "category": entry["category"],
                "reason": entry["reason"],
                "index": index,
            })
    return matches


def unique_terms(matches):
    seen = set()
    out = []
    for m in matches:
        if m["term"] not in seen:
            seen.add(m["term"])
            out.append(m["term"])
    return out


def score_risk(matches, total_ingredients, mode="STRICT"):
    added_matches = [m for m in matches if m["category"] in ("added_sugar", "hidden_sugar")]
    artificial_matches = [m for m in matches if m["category"] == "artificial_sweetener"]
    sugar_alcohol_matches = [m for m in matches if m["category"] == "sugar_alcohol"]

    added_terms = unique_terms(added_matches)
    artificial_terms = unique_terms(artificial_matches)
    sugar_alcohol_terms = unique_terms(sugar_alcohol_matches)

    has_any_signal = len(added_terms) > 0 or len(artificial_terms) > 0 or len(sugar_alcohol_terms) > 0
    if not has_any_signal:
        return {"score": 0, "added_terms": added_terms, "hidden_hit": False, "prominent": False}

    score = 0

    if len(added_terms) >= 1:
        score += 30
    if len(added_terms) >= 2:
        score += 20
    if len(added_terms) >= 3:
        score += 10
    if len(added_terms) >= 4:
        score += min(10, (len(added_terms) - 3) * 5)

    hidden_hit = any(m["category"] == "hidden_sugar" for m in added_matches)
    if hidden_hit:
        score += 15

    prominent = False
    if len(added_matches) > 0 and total_ingredients > 0:
        earliest_index = min(m["index"] for m in added_matches)
        threshold = max(2, -(-total_ingredients * 20 // 100))  # ceil(total*0.2)
        if earliest_index < threshold:
            prominent = True
            score += 25

    artificial_weight = 20 if mode == "STRICT" else 8
    sugar_alcohol_weight = 10 if mode == "STRICT" else 4
    score += min(2, len(artificial_terms)) * artificial_weight
    score += min(2, len(sugar_alcohol_terms)) * sugar_alcohol_weight

    score = max(0, min(100, score))
    return {"score": score, "added_terms": added_terms, "hidden_hit": hidden_hit, "prominent": prominent}


def risk_level_from_score(score: int) -> str:
    if score >= 80:
        return "VERY_HIGH"
    if score >= 55:
        return "HIGH"
    if score >= 30:
        return "MODERATE"
    if score >= 10:
        return "LOW"
    return "SAFE"


def build_explanation(added_terms, artificial_terms, sugar_alcohol_terms, hidden_hit, natural_terms, score):
    if score == 0:
        if len(natural_terms) > 0:
            return ("No added sugar or artificial sweeteners detected. Naturally occurring sugars "
                    "(e.g. lactose or whole-fruit sugar) may be present.")
        return "No sugar-related ingredients detected in the provided ingredient list."

    parts = []
    if len(added_terms) > 0:
        shown = ", ".join(added_terms[:3]) + (", ..." if len(added_terms) > 3 else "")
        plural = "s" if len(added_terms) > 1 else ""
        parts.append(f"{len(added_terms)} added sugar source{plural} detected ({shown})")
    if hidden_hit:
        parts.append('includes a sugar source not obviously named "sugar"')

    sweeteners = artificial_terms + sugar_alcohol_terms
    if len(sweeteners) > 0:
        plural = "s" if len(sweeteners) > 1 else ""
        shown = ", ".join(sweeteners[:3])
        parts.append(f"contains non-nutritive sweetener{plural} ({shown})")

    text = "; ".join(parts)
    return text[0].upper() + text[1:] + "."


def analyze_ingredients_text(raw_ingredients: str, mode="STRICT"):
    """Full pipeline port of analyzeIngredientsText() (STRICT mode)."""
    normalized = normalize_ingredients(raw_ingredients or "")
    ingredient_list = normalized["list"]
    trimmed_length = len((raw_ingredients or "").strip())
    needs_ingredients = trimmed_length == 0

    matches = detect_matches(ingredient_list)
    scored = score_risk(matches, len(ingredient_list), mode)
    score = scored["score"]
    added_terms = scored["added_terms"]
    hidden_hit = scored["hidden_hit"]

    artificial_matches = [m for m in matches if m["category"] == "artificial_sweetener"]
    sugar_alcohol_matches = [m for m in matches if m["category"] == "sugar_alcohol"]
    natural_matches = [m for m in matches if m["category"] == "natural_sugar_context"]

    artificial_terms = unique_terms(artificial_matches)
    sugar_alcohol_terms = unique_terms(sugar_alcohol_matches)
    natural_terms = unique_terms(natural_matches)

    contains_artificial_sweetener = len(artificial_terms) > 0 or len(sugar_alcohol_terms) > 0
    contains_added_sugar = len(added_terms) > 0
    contains_hidden_sugar = hidden_hit
    contains_natural_sugar = len(natural_terms) > 0

    risk_level = "MODERATE" if needs_ingredients else risk_level_from_score(score)

    explanation = (
        "No ingredients were provided, so SugarShield cannot verify sugar content. Defaulting to a cautious rating."
        if needs_ingredients
        else build_explanation(added_terms, artificial_terms, sugar_alcohol_terms, hidden_hit, natural_terms, score)
    )

    return {
        "riskLevel": risk_level,
        "score": 40 if needs_ingredients else score,
        "containsAddedSugar": contains_added_sugar,
        "containsHiddenSugar": contains_hidden_sugar,
        "containsArtificialSweetener": contains_artificial_sweetener,
        "containsNaturalSugar": contains_natural_sugar,
        "detectedSugars": added_terms,
        "artificialSweeteners": artificial_terms + sugar_alcohol_terms,
        "naturalSugarContext": natural_terms,
        "explanation": explanation,
        "matches": matches,
        "normalizedIngredients": ingredient_list,
        "needsIngredients": needs_ingredients,
    }
