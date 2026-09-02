"""Shared constants for the SugarShield ML pipeline.

Keeping the prompt/target format in one place means prepare_dataset.py,
train.py, evaluate.py and infer.py can never drift out of sync with each
other.
"""

import json

RISK_LEVELS = ["SAFE", "LOW", "MODERATE", "HIGH", "VERY_HIGH"]
RISK_RANK = {level: i for i, level in enumerate(RISK_LEVELS)}

EOS = "<|end|>"


def build_prompt(product_name, ingredients_raw, nutrition=None):
    nutrition = nutrition or {}
    total_sugars = nutrition.get("total_sugars_g")
    added_sugars = nutrition.get("added_sugars_g")
    serving = nutrition.get("serving_size")
    name = (product_name or "Unknown product").strip()
    ingredients = (ingredients_raw or "").strip()
    return (
        f"Product: {name}\n"
        f"Ingredients: {ingredients}\n"
        f"Nutrition: serving_size={serving}, total_sugars_g={total_sugars}, added_sugars_g={added_sugars}\n"
        f"Analyze sugar risk as JSON:\n"
    )


def build_target(record):
    """Builds the compact JSON completion string the model is trained to produce."""
    payload = {
        "risk_level": record["risk_level"],
        "contains_added_sugar": bool(record["contains_added_sugar"]),
        "contains_hidden_sugar": bool(record["contains_hidden_sugar"]),
        "contains_artificial_sweetener": bool(record["contains_artificial_sweetener"]),
        "contains_natural_sugar": bool(record["contains_natural_sugar"]),
        "detected_sugars": list(record.get("detected_sugars") or []),
        "artificial_sweeteners": list(record.get("artificial_sweeteners") or []),
        "confidence": record.get("model_confidence", 0.9 if record.get("verified") else 0.7),
        "explanation": (record.get("explanation") or "").strip()[:220],
    }
    return json.dumps(payload, separators=(",", ":")) + EOS


def extract_first_json(text):
    """Finds and parses the first balanced {...} object in `text`. Returns None on failure."""
    start = text.find("{")
    if start == -1:
        return None
    depth = 0
    for i in range(start, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                candidate = text[start : i + 1]
                try:
                    return json.loads(candidate)
                except json.JSONDecodeError:
                    return None
    return None


REQUIRED_KEYS = [
    "risk_level",
    "contains_added_sugar",
    "contains_hidden_sugar",
    "contains_artificial_sweetener",
    "contains_natural_sugar",
    "detected_sugars",
    "artificial_sweeteners",
    "confidence",
    "explanation",
]


def is_valid_prediction(obj):
    if not isinstance(obj, dict):
        return False
    if not all(k in obj for k in REQUIRED_KEYS):
        return False
    if obj["risk_level"] not in RISK_LEVELS:
        return False
    return True
