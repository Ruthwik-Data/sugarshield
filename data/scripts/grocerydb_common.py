# data/scripts/grocerydb_common.py
#
# Shared helpers for joining and categorizing GroceryDB
# (github.com/Barabasi-Lab/GroceryDB, MIT license) into the SugarShield
# record schema. See data/README.md for the full provenance note on why
# GroceryDB is our bulk real-data source instead of the Open Food Facts
# REST API (blocked by this environment's network egress policy).

import re

# GroceryDB "harmonized single category" -> SugarShield category enum.
# Categories not listed here fall back to "other".
BASE_CATEGORY_MAP = {
    "drink-soft-energy-mixes": "soda",
    "drink-juice": "juice",
    "drink-juice-wf": "juice",
    "cereal": "cereal",
    "snacks-bars": "snack",  # refined further: "protein" in name -> protein_bar
    "dairy-yogurt-drink": "yogurt",
    "sauce-all": "sauce",
    "dressings": "sauce",
    "snacks-chips": "snack",
    "snacks-mixes-crackers": "snack",
    "snacks-dips-salsa": "snack",
    "snacks-popcorn": "snack",
    "snacks-nuts-seeds": "snack",
    "pastry-chocolate-candy": "dessert",
    "cookies-biscuit": "dessert",
    "ice-cream-dessert": "dessert",
    "cakes": "dessert",
    "pudding-jello": "dessert",
    "bread": "bread",
    "rolls-buns-wraps": "bread",
    "breakfast": "breakfast",
    "muffins-bagels": "breakfast",
    "drink-shakes-other": "protein_product",
    "baby-food": "kids_food",
    "milk-milk-substitute": "natural_sugar",  # refined: only plain/unsweetened kept as natural_sugar
    "drink-water-wf": "natural_sugar",
}

# Everything else (meat, seafood, cheese, spices, culinary-ingredients, baking,
# canned-goods, soup-stew, prepared-meals-dishes, pasta-noodles, pizza,
# mac-cheese, salad, rice-grains-*, nuts-seeds-wf, coffee-beans-wf,
# drink-coffee, drink-tea, jerky, spread-squeeze, produce-*, sausage-bacon,
# seafood-wf, eggs-wf, canned-goods) maps to "other".

_HEALTHY_MARKETING_WORDS = [
    "organic", "no sugar added", "no added sugar", "whole grain", "gluten free",
    "gluten-free", "natural", "superfood", "clean", "wholesome", "low sugar",
    "protein", "fiber", "immune", "real fruit", "made with real",
]
_PLAIN_UNSWEETENED_WORDS = ["plain", "unsweetened", "100%", "unflavored", "unflavoured"]
_SUGAR_FREE_WORDS = ["sugar free", "sugar-free", "zero sugar", "no sugar added", "sugarless"]
_KIDS_WORDS = ["kids", "kid", "toddler", "baby", "children", "child"]


def classify_grocerydb_category(harmonized_category: str, product_name: str) -> str:
    name = (product_name or "").lower()
    base = BASE_CATEGORY_MAP.get(harmonized_category, "other")

    if harmonized_category == "snacks-bars" and "protein" in name:
        return "protein_bar"
    if any(w in name for w in _KIDS_WORDS) and base in ("snack", "juice", "breakfast", "cereal", "dessert", "yogurt"):
        return "kids_food"
    return base


def refine_category_post_label(base_category: str, product_name: str, contains_added_sugar: bool,
                                contains_artificial_sweetener: bool, detected_sugar_count: int) -> str:
    """Apply cross-cutting overrides that depend on the detected sugar signals
    (only knowable after running the ported risk engine). Mirrors the spirit
    of lib/riskEngine.ts's factual-detection-first design: category is a
    dataset-organization label, not itself part of the risk computation."""
    name = (product_name or "").lower()

    if any(w in name for w in _SUGAR_FREE_WORDS):
        return "sugar_free"

    if base_category in ("soda", "juice", "protein_product", "natural_sugar") and contains_artificial_sweetener and not contains_added_sugar:
        return "artificially_sweetened"

    if base_category == "natural_sugar":
        # Only genuinely plain/unsweetened items earn this bucket; anything
        # with a real added-sugar hit doesn't belong here.
        if contains_added_sugar:
            return "other"
        return "natural_sugar"

    if base_category == "yogurt" and any(w in name for w in _PLAIN_UNSWEETENED_WORDS) and not contains_added_sugar:
        return "natural_sugar"

    if base_category in ("snack", "protein_bar", "cereal", "breakfast") and contains_added_sugar and detected_sugar_count >= 2:
        if any(w in name for w in _HEALTHY_MARKETING_WORDS):
            return "healthy_marketed"

    return base_category


def flatten_ingredient_tree(nodes, depth=0):
    """Render a GroceryDB ingredient_tree back into a realistic label-style
    ingredients string: top-level items joined by commas, with any
    sub_ingredients nested in parentheses, recursively -- e.g.
    'Whey Crisp (Whey Protein Concentrate, Rice Flour), Almonds'."""
    if not nodes:
        return ""
    ordered = sorted(nodes, key=lambda n: n.get("order") or 0)
    parts = []
    for node in ordered:
        # Prefer the verbatim label text (original_text) over ingredient_name,
        # which GroceryDB sometimes annotates with descriptor markup like
        # "<high> fructose corn syrup" for "high fructose corn syrup".
        text = (node.get("original_text") or node.get("ingredient_name") or node.get("general_name") or "").strip()
        if not text:
            continue
        subs = node.get("sub_ingredients") or []
        if subs:
            sub_text = flatten_ingredient_tree(subs, depth + 1)
            if sub_text:
                text = f"{text} ({sub_text})"
        parts.append(text)
    return ", ".join(parts)


def count_leaf_ingredients(nodes) -> int:
    if not nodes:
        return 0
    total = 0
    for node in nodes:
        subs = node.get("sub_ingredients") or []
        if subs:
            total += count_leaf_ingredients(subs)
        else:
            total += 1
    return total
