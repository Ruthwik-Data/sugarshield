# data/scripts/lexicon.py
#
# Faithful Python port of /home/user/sugarshield/lib/lexicon.ts
# Keep this list in sync with the TypeScript source by hand; it is the
# ground truth term list used to silver-label the bulk Open Food Facts
# dataset the same way the live SugarShield rule engine would.

ADDED_SUGAR = [
    ("sugar", "Standard refined sugar (sucrose)."),
    ("added sugar", "Explicitly labeled added sugar."),
    ("cane sugar", "Refined sugar from sugar cane."),
    ("brown sugar", "Refined sugar retaining some molasses."),
    ("raw sugar", "Minimally refined cane sugar, still added sugar."),
    ("turbinado sugar", "Partially refined cane sugar."),
    ("demerara sugar", "Partially refined cane sugar."),
    ("muscovado sugar", "Unrefined cane sugar high in molasses."),
    ("powdered sugar", "Finely ground refined sugar."),
    ("confectioner's sugar", "Finely ground refined sugar."),
    ("icing sugar", "Finely ground refined sugar."),
    ("sucrose", "Chemical name for table sugar."),
    ("glucose", "Simple sugar, common added sweetener."),
    ("fructose", "Fruit sugar, often added in crystalline form."),
    ("crystalline fructose", "Highly concentrated added fructose."),
    ("dextrose", "Simple sugar chemically identical to blood glucose."),
    ("maltose", "Malt sugar, a disaccharide sweetener."),
    ("corn syrup", "Liquid sweetener made from corn starch."),
    ("high fructose corn syrup", "Highly processed corn syrup, high in fructose."),
    ("hfcs", "Abbreviation for high fructose corn syrup."),
    ("glucose syrup", "Liquid glucose sweetener."),
    ("glucose-fructose syrup", "Blended liquid sweetener."),
    ("maple syrup", "Natural syrup used as an added sweetener."),
    ("agave syrup", "Concentrated syrup from agave, very high in fructose."),
    ("agave nectar", "Concentrated syrup from agave, very high in fructose."),
    ("molasses", "Byproduct of refining sugar cane or beets."),
    ("blackstrap molasses", "Concentrated sugar-cane byproduct."),
    ("invert sugar", "Processed liquid sugar blend of glucose and fructose."),
    ("honey", "Natural sweetener that still counts as added sugar in a recipe."),
    # "caramel" / "caramel color" deliberately omitted — see lib/lexicon.ts:
    # caramel color (E150) is a trace coloring agent (classically in diet
    # sodas) with negligible dietary sugar; keeping it caused false
    # "contains added sugar" positives on zero-sugar products.
    ("malt syrup", "Sugar syrup derived from malted grain."),
    ("barley malt", "Sugar syrup derived from malted barley."),
    ("barley malt syrup", "Sugar syrup derived from malted barley."),
    ("malt", "Malt-based sweetener or flavoring, often carries sugar."),
    ("coconut sugar", "Added sugar derived from coconut palm sap."),
    ("coconut nectar", "Added sugar syrup derived from coconut palm sap."),
    ("date sugar", "Added sugar made from dried, ground dates."),
    ("date syrup", "Added sugar syrup made from dates."),
    ("palm sugar", "Added sugar derived from palm sap."),
    ("sorghum syrup", "Added sugar syrup from sorghum cane."),
    ("golden syrup", "Refined cane/beet sugar syrup."),
    ("treacle", "Refined sugar syrup byproduct."),
    ("liquid sugar", "Dissolved refined sugar used as a sweetener."),
    ("refiner's syrup", "Byproduct syrup of sugar refining."),
]

HIDDEN_SUGAR = [
    ("maltodextrin", "Processed carbohydrate that spikes blood sugar like sugar, often used as a filler or sweetener."),
    ("dextrin", "Processed starch derivative used as a hidden sweetener/thickener."),
    ("corn syrup solids", "Dried corn syrup, a concentrated hidden sugar."),
    ("brown rice syrup", "Processed sugar syrup marketed as a \"natural\" alternative."),
    ("rice syrup", "Processed sugar syrup from rice starch."),
    ("tapioca syrup", "Processed sugar syrup from tapioca starch."),
    ("cane juice", "Marketing name for added cane sugar."),
    ("evaporated cane juice", "Regulatory-flagged rebrand of added cane sugar."),
    ("dehydrated cane juice", "Rebrand of added cane sugar."),
    ("organic cane juice", "Rebrand of added cane sugar."),
    ("fruit juice concentrate", "Concentrated fruit sugar with fiber removed, functions like added sugar."),
    ("concentrated fruit juice", "Concentrated fruit sugar with fiber removed, functions like added sugar."),
    ("fruit juice from concentrate", "Reconstituted concentrated fruit sugar."),
    ("apple juice concentrate", "Concentrated fruit sugar used as a hidden sweetener."),
    ("pear juice concentrate", "Concentrated fruit sugar used as a hidden sweetener."),
    ("grape juice concentrate", "Concentrated fruit sugar used as a hidden sweetener."),
    ("white grape juice concentrate", "Concentrated fruit sugar used as a hidden sweetener."),
]

ARTIFICIAL_SWEETENER = [
    ("aspartame", "Artificial non-nutritive sweetener (~200x sweeter than sugar)."),
    ("sucralose", "Artificial non-nutritive sweetener."),
    ("saccharin", "Artificial non-nutritive sweetener."),
    ("acesulfame potassium", "Artificial non-nutritive sweetener."),
    ("acesulfame k", "Artificial non-nutritive sweetener."),
    ("ace-k", "Artificial non-nutritive sweetener."),
    ("neotame", "Artificial non-nutritive sweetener related to aspartame."),
    ("advantame", "Artificial non-nutritive sweetener related to aspartame."),
    ("cyclamate", "Artificial non-nutritive sweetener."),
]

PLANT_SWEETENER = [
    ("stevia", "Plant-derived non-nutritive sweetener."),
    ("stevia leaf extract", "Plant-derived non-nutritive sweetener."),
    ("rebaudioside a", "Purified stevia sweetener compound."),
    ("reb a", "Purified stevia sweetener compound."),
    ("monk fruit", "Plant-derived non-nutritive sweetener."),
    ("monk fruit extract", "Plant-derived non-nutritive sweetener."),
    ("luo han guo", "Monk fruit, a plant-derived non-nutritive sweetener."),
    ("allulose", "Rare sugar with minimal caloric/glycemic impact, used as a sweetener."),
]

SUGAR_ALCOHOL = [
    ("erythritol", "Sugar alcohol with negligible calories/glycemic impact."),
    ("xylitol", "Sugar alcohol sweetener."),
    ("sorbitol", "Sugar alcohol sweetener."),
    ("maltitol", "Sugar alcohol sweetener with a moderate glycemic impact."),
    ("mannitol", "Sugar alcohol sweetener."),
    ("isomalt", "Sugar alcohol sweetener."),
    ("lactitol", "Sugar alcohol sweetener."),
]

NATURAL_SUGAR_CONTEXT = [
    ("milk", "Contains naturally occurring lactose."),
    ("whole milk", "Contains naturally occurring lactose."),
    ("nonfat milk", "Contains naturally occurring lactose."),
    ("skim milk", "Contains naturally occurring lactose."),
    ("lactose", "Naturally occurring milk sugar."),
    ("cultured milk", "Contains naturally occurring lactose."),
    ("cultured pasteurized nonfat milk", "Plain yogurt base; naturally occurring lactose only."),
    ("yogurt cultures", "Fermentation culture, not an added sweetener."),
    ("coconut water", "Contains naturally occurring fruit sugars."),
    ("apple", "Whole-fruit form; naturally occurring sugar with fiber intact."),
    ("banana", "Whole-fruit form; naturally occurring sugar with fiber intact."),
    ("orange", "Whole-fruit form; naturally occurring sugar with fiber intact."),
    ("strawberry", "Whole-fruit form; naturally occurring sugar with fiber intact."),
    ("blueberry", "Whole-fruit form; naturally occurring sugar with fiber intact."),
    ("raisin", "Dried whole fruit; naturally occurring sugar with fiber intact."),
    ("date", "Whole fruit; naturally occurring sugar with fiber intact."),
    ("100% fruit juice", "Naturally occurring fruit sugar, not a concentrate."),
]

LEXICON = []
for term, reason in ADDED_SUGAR:
    LEXICON.append({"term": term, "category": "added_sugar", "reason": reason})
for term, reason in HIDDEN_SUGAR:
    LEXICON.append({"term": term, "category": "hidden_sugar", "reason": reason})
for term, reason in ARTIFICIAL_SWEETENER:
    LEXICON.append({"term": term, "category": "artificial_sweetener", "reason": reason})
for term, reason in PLANT_SWEETENER:
    LEXICON.append({"term": term, "category": "artificial_sweetener", "reason": reason})
for term, reason in SUGAR_ALCOHOL:
    LEXICON.append({"term": term, "category": "sugar_alcohol", "reason": reason})
for term, reason in NATURAL_SUGAR_CONTEXT:
    LEXICON.append({"term": term, "category": "natural_sugar_context", "reason": reason})

# Sort longest-term-first so multi-word terms are matched before their
# single-word substrings (e.g. "high fructose corn syrup" before "corn syrup").
LEXICON_BY_LENGTH = sorted(LEXICON, key=lambda e: len(e["term"]), reverse=True)
