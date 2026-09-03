# data/scripts/lexicon.py
#
# Faithful Python port of /home/user/sugarshield/lib/lexicon.ts
# Keep this list in sync with the TypeScript source by hand; it is the
# ground truth term list used to silver-label the bulk dataset the same way
# the live SugarShield rule engine would.
#
# Two taxonomies, same as the TS source:
#   - category    — the 5 functional buckets that drive scoring (unchanged
#                   meaning: added_sugar / hidden_sugar / artificial_sweetener
#                   / sugar_alcohol / natural_sugar_context).
#   - subcategory — an 8-way display/audit taxonomy (added sugars, syrups,
#                   glucose/fructose derivatives, malt-derived, fruit
#                   concentrates used as sweeteners, sugar alcohols,
#                   artificial/non-nutritive sweeteners, natural-sugar
#                   context). Purely organizational.
# `canonical` collapses true label synonyms of the same substance (e.g.
# "hfcs" -> "high fructose corn syrup") so detected_sugars output is
# consistent regardless of which alias matched.

# Each tuple: (term, canonical, reason)

ADDED_SUGAR = [
    ("sugar", "sugar", "Standard refined sugar (sucrose)."),
    ("added sugar", "sugar", "Explicitly labeled added sugar."),
    ("cane sugar", "sugar", "Refined sugar from sugar cane."),
    ("granulated sugar", "sugar", "Standard refined table sugar."),
    ("table sugar", "sugar", "Standard refined table sugar."),
    ("white sugar", "sugar", "Standard refined table sugar."),
    ("refined sugar", "sugar", "Standard refined table sugar."),
    ("beet sugar", "sugar", "Refined sugar from sugar beets, chemically identical to cane sugar."),
    ("caster sugar", "sugar", "Finely ground refined sugar."),
    ("superfine sugar", "sugar", "Finely ground refined sugar."),
    ("sucrose", "sugar", "Chemical name for table sugar."),
    ("brown sugar", "brown sugar", "Refined sugar retaining some molasses."),
    ("light brown sugar", "brown sugar", "Refined sugar retaining some molasses."),
    ("dark brown sugar", "brown sugar", "Refined sugar retaining more molasses."),
    ("raw sugar", "raw sugar", "Minimally refined cane sugar, still added sugar."),
    ("turbinado sugar", "turbinado sugar", "Partially refined cane sugar."),
    ("demerara sugar", "demerara sugar", "Partially refined cane sugar with a light molasses coating."),
    ("muscovado sugar", "muscovado sugar", "Unrefined cane sugar high in molasses."),
    ("powdered sugar", "powdered sugar", "Finely ground refined sugar."),
    ("confectioner's sugar", "powdered sugar", "Finely ground refined sugar."),
    ("confectioners sugar", "powdered sugar", "Finely ground refined sugar."),
    ("icing sugar", "powdered sugar", "Finely ground refined sugar."),
    ("honey", "honey", "Natural sweetener that still counts as added sugar in a recipe."),
    ("coconut sugar", "coconut sugar", "Added sugar derived from coconut palm sap."),
    ("coconut palm sugar", "coconut sugar", "Added sugar derived from coconut palm sap."),
    ("coconut nectar", "coconut nectar", "Added sugar syrup derived from coconut palm sap."),
    ("palm sugar", "palm sugar", "Added sugar derived from palm sap."),
    ("date sugar", "date sugar", "Added sugar made from dried, ground dates."),
    ("jaggery", "jaggery", "Unrefined cane/palm sugar, common in South Asian cooking."),
    ("gur", "jaggery", "Hindi/Urdu name for jaggery, an unrefined cane sugar."),
    ("panela", "panela", "Unrefined whole cane sugar, common in Latin American cooking."),
    ("piloncillo", "panela", "Mexican name for unrefined whole cane sugar (panela)."),
    ("rapadura", "panela", "Brazilian name for unrefined whole cane sugar (panela)."),
    ("liquid sugar", "liquid sugar", "Dissolved refined sugar used as a sweetener."),
    # "caramel" / "caramel color" deliberately omitted — see lib/lexicon.ts:
    # caramel color (E150) is a trace coloring agent (classically in diet
    # sodas) with negligible dietary sugar; keeping it caused false
    # "contains added sugar" positives on zero-sugar products.
]

SYRUPS = [
    ("corn syrup", "corn syrup", "Liquid sweetener made from corn starch."),
    ("light corn syrup", "corn syrup", "Liquid sweetener made from corn starch."),
    ("dark corn syrup", "corn syrup", "Liquid sweetener made from corn starch, with added molasses/caramel."),
    ("high fructose corn syrup", "high fructose corn syrup", "Highly processed corn syrup, high in fructose."),
    ("high-fructose corn syrup", "high fructose corn syrup", "Highly processed corn syrup, high in fructose."),
    ("hfcs", "high fructose corn syrup", "Abbreviation for high fructose corn syrup."),
    ("maple syrup", "maple syrup", "Natural syrup used as an added sweetener."),
    ("golden syrup", "golden syrup", "Refined cane/beet sugar syrup."),
    ("treacle", "treacle", "Refined sugar syrup byproduct, similar to molasses."),
    ("refiner's syrup", "treacle", "Byproduct syrup of sugar refining (treacle)."),
    ("agave syrup", "agave syrup", "Concentrated syrup from agave, very high in fructose."),
    ("agave nectar", "agave syrup", "Concentrated syrup from agave, very high in fructose."),
    ("blue agave syrup", "agave syrup", "Concentrated syrup from agave, very high in fructose."),
    ("molasses", "molasses", "Byproduct of refining sugar cane or beets."),
    ("molasse", "molasses", "Byproduct of refining sugar cane or beets (singular/regional spelling seen on real ingredient labels)."),
    ("blackstrap molasses", "molasses", "Concentrated sugar-cane byproduct."),
    ("molasses powder", "molasses powder", "Dried/powdered molasses used as a sweetener."),
    ("molasse powder", "molasses powder", "Dried/powdered molasses used as a sweetener (singular spelling variant)."),
    ("cane syrup", "cane syrup", "Syrup made by boiling down sugar cane juice."),
    ("sorghum syrup", "sorghum syrup", "Added sugar syrup from sorghum cane."),
    ("sorghum molasses", "sorghum syrup", "Added sugar syrup from sorghum cane."),
    ("date syrup", "date syrup", "Added sugar syrup made from dates."),
    ("invert sugar", "invert sugar", "Processed liquid sugar blend of glucose and fructose."),
    ("inverted sugar syrup", "invert sugar", "Processed liquid sugar blend of glucose and fructose."),
]

GLUCOSE_FRUCTOSE_DERIVATIVES = [
    ("glucose", "glucose", "Simple sugar, common added sweetener."),
    ("glucose syrup", "glucose syrup", "Liquid glucose sweetener."),
    ("glucose-fructose syrup", "glucose-fructose syrup", "Blended liquid sweetener (the EU/UK equivalent of HFCS)."),
    ("isoglucose", "glucose-fructose syrup", "EU regulatory name for a glucose-fructose syrup equivalent to HFCS."),
    ("dextrose", "dextrose", "Simple sugar chemically identical to blood glucose."),
    ("dextrose monohydrate", "dextrose", "Simple sugar chemically identical to blood glucose."),
    ("anhydrous dextrose", "dextrose", "Simple sugar chemically identical to blood glucose."),
    ("fructose", "fructose", "Fruit sugar, often added in crystalline form."),
    ("crystalline fructose", "fructose", "Highly concentrated added fructose."),
    ("levulose", "fructose", "Older chemical name for fructose."),
    ("maltose", "maltose", "Malt sugar, a disaccharide sweetener."),
    ("malt sugar", "maltose", "Malt sugar, a disaccharide sweetener."),
    ("galactose", "galactose", "Simple sugar, sometimes added or a hydrolysis product of lactose."),
    ("trehalose", "trehalose", "Disaccharide sweetener used as a stabilizer/sweetener."),
]

MALT_DERIVED = [
    ("malt syrup", "malt syrup", "Sugar syrup derived from malted grain."),
    ("barley malt", "barley malt syrup", "Sugar syrup derived from malted barley."),
    ("barley malt syrup", "barley malt syrup", "Sugar syrup derived from malted barley."),
    ("malted barley", "barley malt syrup", "Sugar syrup derived from malted barley."),
    ("malt extract", "malt extract", "Concentrated malt-derived sweetener/flavoring."),
    ("diastatic malt powder", "malt extract", "Malt-derived sweetener/leavening aid."),
    ("malt", "malt", "Malt-based sweetener or flavoring, often carries sugar."),
]

FRUIT_CONCENTRATE_SWEETENERS = [
    ("fruit juice concentrate", "fruit juice concentrate", "Concentrated fruit sugar with fiber removed, functions like added sugar."),
    ("concentrated fruit juice", "fruit juice concentrate", "Concentrated fruit sugar with fiber removed, functions like added sugar."),
    ("dried fruit juice concentrate", "fruit juice concentrate", "Concentrated fruit sugar with fiber removed, functions like added sugar."),
    ("fruit juice from concentrate", "fruit juice concentrate", "Reconstituted concentrated fruit sugar."),
    ("apple juice concentrate", "apple juice concentrate", "Concentrated fruit sugar used as a hidden sweetener."),
    ("pear juice concentrate", "pear juice concentrate", "Concentrated fruit sugar used as a hidden sweetener."),
    ("grape juice concentrate", "grape juice concentrate", "Concentrated fruit sugar used as a hidden sweetener."),
    ("white grape juice concentrate", "white grape juice concentrate", "Concentrated fruit sugar used as a hidden sweetener."),
    ("pineapple juice concentrate", "pineapple juice concentrate", "Concentrated fruit sugar used as a hidden sweetener."),
    ("pear puree concentrate", "pear juice concentrate", "Concentrated fruit sugar used as a hidden sweetener/binder."),
    # Generic fallbacks: real ingredient labels name dozens of specific
    # fruits ("black carrot juice concentrate", "cranberry juice
    # concentrate", ...) that can't all be enumerated. These generic terms
    # are shorter than every specific "<fruit> juice concentrate" entry
    # above, and LEXICON_BY_LENGTH tries longest-term-first, so a specific
    # entry still wins when present -- this only catches fruits not
    # individually listed.
    ("juice concentrate", "fruit juice concentrate", "Concentrated fruit sugar with fiber removed, functions like added sugar (generic fallback for a fruit not individually listed)."),
    ("juice from concentrate", "fruit juice concentrate", "Reconstituted concentrated fruit sugar (generic fallback for a fruit not individually listed)."),
    ("raisin juice", "fruit juice concentrate", "Concentrated dried-grape sugar used as a hidden sweetener."),
    ("date paste", "date paste", "Whole-date paste used as a concentrated added sweetener."),
    ("fig paste", "fig paste", "Whole-fig paste used as a concentrated added sweetener."),
    ("cane juice", "evaporated cane juice", "Marketing name for added cane sugar."),
    ("evaporated cane juice", "evaporated cane juice", "Regulatory-flagged rebrand of added cane sugar."),
    ("dehydrated cane juice", "evaporated cane juice", "Rebrand of added cane sugar."),
    ("organic cane juice", "evaporated cane juice", "Rebrand of added cane sugar."),
]

# Hidden-sugar processing signals that aren't syrups/concentrates
HIDDEN_SUGAR_OTHER = [
    ("maltodextrin", "maltodextrin", "Processed carbohydrate that spikes blood sugar like sugar, often used as a filler or sweetener."),
    ("corn syrup solids", "corn syrup solids", "Dried corn syrup, a concentrated hidden sugar."),
    ("brown rice syrup", "brown rice syrup", "Processed sugar syrup marketed as a \"natural\" alternative."),
    ("rice syrup", "rice syrup", "Processed sugar syrup from rice starch."),
    ("rice bran syrup", "rice syrup", "Processed sugar syrup from rice bran starch."),
    ("tapioca syrup", "tapioca syrup", "Processed sugar syrup from tapioca starch."),
    ("dextrin", "dextrin", "Processed starch derivative used as a hidden sweetener/thickener."),
    ("tapioca dextrin", "dextrin", "Processed starch derivative used as a hidden sweetener/thickener."),
    ("corn dextrin", "dextrin", "Processed starch derivative used as a hidden sweetener/thickener."),
]

ARTIFICIAL_SWEETENER = [
    ("aspartame", "aspartame", "Artificial non-nutritive sweetener (~200x sweeter than sugar)."),
    ("sucralose", "sucralose", "Artificial non-nutritive sweetener."),
    ("saccharin", "saccharin", "Artificial non-nutritive sweetener."),
    ("acesulfame potassium", "acesulfame potassium", "Artificial non-nutritive sweetener."),
    ("acesulfame k", "acesulfame potassium", "Artificial non-nutritive sweetener."),
    ("ace-k", "acesulfame potassium", "Artificial non-nutritive sweetener."),
    ("neotame", "neotame", "Artificial non-nutritive sweetener related to aspartame."),
    ("advantame", "advantame", "Artificial non-nutritive sweetener related to aspartame."),
    ("cyclamate", "cyclamate", "Artificial non-nutritive sweetener."),
    ("sodium cyclamate", "cyclamate", "Artificial non-nutritive sweetener."),
    ("tagatose", "tagatose", "Low-calorie rare sugar used as a non-nutritive sweetener."),
]

PLANT_SWEETENER = [
    ("stevia", "stevia", "Plant-derived non-nutritive sweetener."),
    ("stevia leaf extract", "stevia", "Plant-derived non-nutritive sweetener."),
    ("stevia extract", "stevia", "Plant-derived non-nutritive sweetener."),
    ("rebaudioside a", "stevia", "Purified stevia sweetener compound."),
    ("reb a", "stevia", "Purified stevia sweetener compound."),
    ("monk fruit", "monk fruit", "Plant-derived non-nutritive sweetener."),
    ("monk fruit extract", "monk fruit", "Plant-derived non-nutritive sweetener."),
    ("luo han guo", "monk fruit", "Monk fruit, a plant-derived non-nutritive sweetener."),
    ("allulose", "allulose", "Rare sugar with minimal caloric/glycemic impact, used as a sweetener."),
]

SUGAR_ALCOHOL = [
    ("erythritol", "erythritol", "Sugar alcohol with negligible calories/glycemic impact."),
    ("xylitol", "xylitol", "Sugar alcohol sweetener."),
    ("sorbitol", "sorbitol", "Sugar alcohol sweetener."),
    ("maltitol", "maltitol", "Sugar alcohol sweetener with a moderate glycemic impact."),
    ("maltitol syrup", "maltitol", "Sugar alcohol sweetener with a moderate glycemic impact."),
    ("mannitol", "mannitol", "Sugar alcohol sweetener."),
    ("isomalt", "isomalt", "Sugar alcohol sweetener."),
    ("lactitol", "lactitol", "Sugar alcohol sweetener."),
    ("hydrogenated starch hydrolysate", "hydrogenated starch hydrolysate", "Mixture of sugar alcohols used as a bulk sweetener."),
]

NATURAL_SUGAR_CONTEXT = [
    ("milk", "milk", "Contains naturally occurring lactose."),
    ("whole milk", "milk", "Contains naturally occurring lactose."),
    ("nonfat milk", "milk", "Contains naturally occurring lactose."),
    ("skim milk", "milk", "Contains naturally occurring lactose."),
    ("lactose", "lactose", "Naturally occurring milk sugar."),
    ("cultured milk", "milk", "Contains naturally occurring lactose."),
    ("cultured pasteurized nonfat milk", "milk", "Plain yogurt base; naturally occurring lactose only."),
    ("yogurt cultures", "yogurt cultures", "Fermentation culture, not an added sweetener."),
    ("coconut water", "coconut water", "Contains naturally occurring fruit sugars."),
    ("apple", "whole fruit", "Whole-fruit form; naturally occurring sugar with fiber intact."),
    ("banana", "whole fruit", "Whole-fruit form; naturally occurring sugar with fiber intact."),
    ("orange", "whole fruit", "Whole-fruit form; naturally occurring sugar with fiber intact."),
    ("strawberry", "whole fruit", "Whole-fruit form; naturally occurring sugar with fiber intact."),
    ("blueberry", "whole fruit", "Whole-fruit form; naturally occurring sugar with fiber intact."),
    ("raisin", "dried fruit", "Dried whole fruit; naturally occurring sugar with fiber intact."),
    ("date", "dried fruit", "Whole fruit; naturally occurring sugar with fiber intact."),
    ("100% fruit juice", "fruit juice (not concentrate)", "Naturally occurring fruit sugar, not a concentrate."),
]

LEXICON = []
for term, canonical, reason in ADDED_SUGAR:
    LEXICON.append({"term": term, "canonical": canonical, "category": "added_sugar", "subcategory": "added_sugar_basic", "reason": reason})
for term, canonical, reason in SYRUPS:
    LEXICON.append({"term": term, "canonical": canonical, "category": "added_sugar", "subcategory": "syrup", "reason": reason})
for term, canonical, reason in GLUCOSE_FRUCTOSE_DERIVATIVES:
    LEXICON.append({"term": term, "canonical": canonical, "category": "added_sugar", "subcategory": "glucose_fructose_derivative", "reason": reason})
for term, canonical, reason in MALT_DERIVED:
    LEXICON.append({"term": term, "canonical": canonical, "category": "added_sugar", "subcategory": "malt_derived", "reason": reason})
for term, canonical, reason in FRUIT_CONCENTRATE_SWEETENERS:
    LEXICON.append({"term": term, "canonical": canonical, "category": "hidden_sugar", "subcategory": "fruit_concentrate_sweetener", "reason": reason})
for term, canonical, reason in HIDDEN_SUGAR_OTHER:
    subcat = "syrup" if "syrup" in canonical else "glucose_fructose_derivative"
    LEXICON.append({"term": term, "canonical": canonical, "category": "hidden_sugar", "subcategory": subcat, "reason": reason})
for term, canonical, reason in ARTIFICIAL_SWEETENER:
    LEXICON.append({"term": term, "canonical": canonical, "category": "artificial_sweetener", "subcategory": "artificial_nonnutritive", "reason": reason})
for term, canonical, reason in PLANT_SWEETENER:
    LEXICON.append({"term": term, "canonical": canonical, "category": "artificial_sweetener", "subcategory": "artificial_nonnutritive", "reason": reason})
for term, canonical, reason in SUGAR_ALCOHOL:
    LEXICON.append({"term": term, "canonical": canonical, "category": "sugar_alcohol", "subcategory": "sugar_alcohol", "reason": reason})
for term, canonical, reason in NATURAL_SUGAR_CONTEXT:
    LEXICON.append({"term": term, "canonical": canonical, "category": "natural_sugar_context", "subcategory": "natural_sugar_context", "reason": reason})

# Sort longest-term-first so multi-word terms are matched before their
# single-word substrings (e.g. "high fructose corn syrup" before "corn syrup").
LEXICON_BY_LENGTH = sorted(LEXICON, key=lambda e: len(e["term"]), reverse=True)
