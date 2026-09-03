# Independent gold benchmark

A second, genuinely independent frozen evaluation set for SugarShield, built
to solve a specific problem with the original `data/gold/gold.jsonl`: most
of those 59 labels were produced by *running SugarShield's own deterministic
rule engine* and saving its output as "ground truth" (honestly documented in
`data/README.md` as "silver labeling"). A system that scores well against
labels it generated itself proves nothing about its real-world accuracy.

**132 records**, labeled by direct human-style reading of real ingredient
text — not by executing `lib/riskEngine.ts`, `lib/lexicon.ts`, or their
Python ports (`data/scripts/risk_engine.py`, `data/scripts/lexicon.py`).

## Independence methodology — read this first

For every record in this file, the `contains_added_sugar`,
`hidden_sugar_terms`, `artificial_or_nonnutritive_sweeteners`,
`natural_sugar_context`, `expected_risk`, and `review_notes` fields were
produced by reading the raw ingredient text and reasoning about it directly,
the way a competent human food-label reviewer would — using general,
well-established public nutrition/food-science knowledge (the kind found in
an FDA sugar-labeling guide, a registered dietitian's glossary, or
Wikipedia's list of sugar substitutes). **At no point in building this file
was `risk_engine.py`, `lexicon.py`, `riskEngine.ts`, or `lexicon.ts`
imported, called, or executed, and no label here was copied from their
output.**

`lib/lexicon.ts` and `data/scripts/lexicon.py` were read *only* as reference
material, to understand SugarShield's own category taxonomy
(`added_sugar` / `hidden_sugar` / `artificial_sweetener` / `sugar_alcohol` /
`natural_sugar_context`) so this file's schema would be compatible with the
existing benchmark's vocabulary. The actual per-record yes/no/which-terms
judgment came from reading each product's ingredient list, not from
executing that code or mechanically replicating its term list. It is
expected and unavoidable that this dataset's labels overlap heavily with
what SugarShield's lexicon would also catch — "high fructose corn syrup" is
added sugar to any correct reviewer, human or machine. The point of building
this file independently is to also catch the cases a specific
implementation's blind spots or over/under-matching would miss: an obscure
sugar alias it doesn't have in its list, a "reduced sugar" product that
still has two sugar sources, a "sugar free" product whose real content is a
stack of sugar alcohols, a long ingredient list that buries a sugar term
past whatever a simple scan checks first, and so on.

Every record's `review_notes` states the actual reasoning for that record's
label in 1–3 sentences, referencing the real ingredient text — not a
generic template and not a rule-engine explanation string. Where a call was
genuinely ambiguous, the note says so and the more cautious label was
chosen, per SugarShield's stated "false negatives are worse than
over-warning" principle.

## Sourcing — GroceryDB, zero overlap with existing splits

**127 of 132 records (96%)** come from real products in
[GroceryDB](https://github.com/Barabasi-Lab/GroceryDB) (Barabási Lab,
Northeastern University; MIT license) — the same real-data source already
used for `data/train`, `data/validation`, and `data/gold` (see
`data/README.md` for why GroceryDB substitutes for the Open Food Facts API
in this environment). GroceryDB was fetched the same way as the existing
pipeline: `git clone --depth 1 https://github.com/Barabasi-Lab/GroceryDB.git`,
joining `GroceryDB_foods.csv` against `UpdatedProductIngredients_11_15.json`
on `original_ID`, reconstructing `ingredients_raw` with the existing
`data/scripts/grocerydb_common.py:flatten_ingredient_tree()` helper (pure
text reconstruction — not a labeling decision, reused verbatim from the
existing pipeline).

The existing train/validation/gold splits together used 1,355 unique
GroceryDB products (of ~50,468 scannable rows — only ~1,470 were ever
joined and kept in the original pipeline, leaving a large untouched pool).
This benchmark draws from **127 additional, previously-unused** GroceryDB
rows, selected via keyword-targeted and category-stratified searches across
the full untouched pool specifically to guarantee coverage of the required
cases below, then hand-reviewed and labeled one at a time. Every candidate's
`original_ID` and `product_name` was cross-checked against all three
existing files before inclusion.

**5 of 132 records (4%)** are hand-composed (`"source": "manual_composed"`),
following the existing gold set's `manual_gold` precedent, for regional
sugar names that a direct, full-catalog GroceryDB search confirmed have no
usable real example in the dataset:

| Term | GroceryDB search result |
|---|---|
| golden syrup | 0 matches anywhere in ~50k rows |
| jaggery | 3 matches, all false positives (a samosa, a vegan chicken wrap, a paneer dish — none actually containing jaggery as an ingredient) |
| panela | 3 matches, all **panela cheese** (a dairy product that shares the name with the sugar, confirmed by reading their ingredient lists: pasteurized milk / salt / enzyme, no sugar at all) |
| gur | only substring false positives (e.g. "yogurt") |
| date syrup (standalone product) | GroceryDB has date syrup only as one ingredient inside composite sauces (several such records are included from real products); no standalone date-syrup-as-product exists to isolate the term cleanly |

These 5 are clearly the minority, are marked `verified: true` per the task
spec, and each `review_notes` documents exactly what was searched for and
why a real example wasn't available.

Run `python3 data/independent_gold/check_no_overlap.py` to verify zero
overlap yourself (see below).

## Record schema

```json
{
  "id": "indep_001",
  "product_name": "...",
  "brand": "... or null",
  "category": "soda | juice | cereal | protein_bar | yogurt | sauce | snack | dessert | bread | breakfast | protein_product | kids_food | healthy_marketed | sugar_free | artificially_sweetened | natural_sugar | other",
  "ingredients_raw": "the real ingredient text",
  "nutrition": {"serving_size": "... or null", "total_sugars_g": number or null, "added_sugars_g": number or null},
  "contains_added_sugar": true/false,
  "hidden_sugar_terms": ["exact substrings identified as hidden/non-obvious sugar"],
  "artificial_or_nonnutritive_sweeteners": ["..."],
  "natural_sugar_context": true/false,
  "expected_risk": "SAFE | LOW | MODERATE | HIGH | VERY_HIGH",
  "source": "grocerydb | manual_composed",
  "source_product_id": "the original GroceryDB original_ID, for traceability",
  "review_notes": "the reviewer's own reasoning, referencing the actual ingredient text",
  "verified": true
}
```

GroceryDB-sourced records carry `nutrition.serving_size: "100g"` and a real
`total_sugars_g` where GroceryDB provided one (its nutrition columns are
per-100g, and it does not separate added sugar from total sugar, hence
`added_sugars_g` is always `null` — the same honest limitation documented
for the existing splits in `data/README.md`). Every `hidden_sugar_terms`
and `artificial_or_nonnutritive_sweeteners` entry was verified to appear as
an exact (case-insensitive) substring of that record's own
`ingredients_raw`.

## Category breakdown (132 records)

| category | count |
|---|---|
| other | 15 |
| cereal | 10 |
| dessert | 10 |
| sauce | 9 |
| bread | 8 |
| juice | 8 |
| natural_sugar | 8 |
| snack | 8 |
| yogurt | 8 |
| soda | 7 |
| healthy_marketed | 7 |
| breakfast | 6 |
| protein_bar | 6 |
| sugar_free | 6 |
| artificially_sweetened | 6 |
| kids_food | 5 |
| protein_product | 5 |

## Expected-risk breakdown

| risk | count |
|---|---|
| SAFE | 28 |
| LOW | 33 |
| MODERATE | 33 |
| HIGH | 25 |
| VERY_HIGH | 13 |

84 records genuinely contain real added sugar (`contains_added_sugar: true`);
48 do not. 37 records involve an artificial or plant-derived non-nutritive
sweetener. 25 records have `natural_sugar_context: true` (whole fruit,
plain dairy, 100% juice, or a case where a natural-fruit sweetener is doing
real sweetening work alongside — or instead of — added sugar).

## Required coverage checklist

Every case the task asked for is represented by at least one real
(GroceryDB-sourced unless noted) record:

- **Obvious added sugar** (sugar, cane sugar, brown sugar): dozens of
  records, e.g. Sprite (HFCS), Kellogg's Frosted Flakes (sugar), Haks
  Organic Brown Sugar BBQ Sauce (brown sugar).
- **Obscure/less-common sugar aliases**: barley malt syrup (Good & Gather
  Honey Almond Granola), treacle syrup (Daelmans Stroopwafels), muscovado
  sugar (Van Leeuwen Brooklyn Brown Sugar Chunk Ice Cream), dried cane
  syrup / evaporated cane juice (Birch Benders pancake mix), golden syrup,
  jaggery, panela, gur (all 4 `manual_composed`).
- **Syrups**: corn syrup (Great Value Ketchup), brown rice syrup (Kodiak
  Cakes bars, Van Leeuwen ice cream), maple syrup (Applegate Chicken &
  Maple Sausage), date syrup (Good Food For Good BBQ sauce + standalone
  `manual_composed` record).
- **Fruit juice concentrate as sweetener**: Capri Sun Fruit Punch, Frutly
  Fruit Punch (four concentrates, no plain sugar at all), Ocean Spray Light
  Cranberry Juice Drink, V8 Splash Tropical Blend — contrasted directly
  against genuine 100% juice (Simply Orange, Ocean Spray 100% Pure
  Cranberry Juice).
- **Maltodextrin** (as its own case, distinct from "sugar"): Muscle Milk
  Chocolate Protein Shake, Quaker Fiber & Protein Oatmeal, Kellogg's
  Special K Protein Shakes, Freshness Guaranteed Sugar Free Cookies.
- **Dextrin**: Freshness Guaranteed Sugar Free Chocolate Chip Cookies
  (lists `dextrin` distinct from `maltodextrin`).
- **Sugar alcohols**: erythritol (Halo Top, Orgain shake), xylitol (Mentos
  gum), sorbitol (Mentos, Voortman cookies, Eclipse gum), maltitol
  (Voortman cookies ×2, Freshness Guaranteed, Pillsbury sugar-free mix).
- **Artificial sweeteners**: aspartame, sucralose, acesulfame potassium —
  Mountain Dew Zero Sugar, Pepsi Zero Sugar, Torani Sugar Free Syrup,
  Crystal Light. **Plant-derived non-nutritive sweeteners**: stevia (Zevia,
  Oikos Triple Zero, Chobani Complete), monk fruit (OWYN, Orgain, CORE
  Kids, GoMacro Kids).
- **Plain dairy**: Dannon Whole Milk Plain Yogurt, FAGE Total 2% Plain
  Greek Yogurt, Kemps Organic Whole Milk, High Lawn Whole Milk, Prairie
  Farms 2% Milk — all single/near-single-ingredient, lactose only.
- **Whole fruit as ingredient (not sweetener use)**: Sun-Maid Raisins
  (single ingredient: raisin), Honeycrisp Apples (single ingredient:
  apple), Great Value Dried Prunes.
- **Plain oats/grains**: Quaker 100% Whole Grain Steel Cut Oats, Good &
  Gather Old Fashioned Oats (single ingredient each).
- **Coconut water**: Vita Coco Organic Coconut Water (real added sugar —
  "coconut water, sugar, ascorbic acid"), Taste Nirvana Coconut Water
  ("fruit sugar" as an added sweetener despite the natural-sounding name).
- **Low-sugar / "reduced sugar" marketed products with real added sugar**:
  four separate reduced/less-sugar ketchups (Heinz ×2, Good & Gather, Great
  Value) each still containing tapioca syrup, sugar, or honey; Silk Less
  Sugar Almond Milk; Ocean Spray Craisins Reduced Sugar (still 30g
  sugar/100g plus sucralose on top).
- **Sugar-free products, verified**: six records under `sugar_free`,
  including one genuine contradiction — Great Value's "Sugar-Free Drink
  Mix" lists plain `sugar` in its own ingredient panel alongside aspartame
  and acesulfame potassium.
- **Misleading "healthy" marketing with 2+ real added-sugar sources**:
  seven records under `healthy_marketed` (Simple Mills, Birch Benders, King
  Arthur, Foodstirs "Junk-Free Bakery", Kodiak Cakes), plus several more
  scattered across `snack`/`protein_bar`/`kids_food` (KIND Healthy Grains,
  Enjoy Life "free from 14 allergens" cookies with 5 sweeteners, CLIF Kid
  Zbar).
- **Long ingredient lists (15+) with a buried sugar term**: Great Value
  Sweet & Salty Chewy Granola Bars (sugar mentioned 6+ times across nested
  sub-ingredients), Great Value Breakfast Blend Trail Mix (21 ingredients,
  4 distinct sugar sources), Great Value Sausage & Gravy Breakfast Bowl,
  MorningStar Farms veggie sausage sandwich.
- **Noisy/messy ingredient text**: Kinder's Organic Mild BBQ Sauce
  preserves GroceryDB's raw OCR/scrape artifact "tomato **pureeee**"
  verbatim, unedited.
- **Uncommon regional sugar names**: muscovado (real product — Van Leeuwen
  ice cream), plus jaggery / panela / gur (`manual_composed`, documented
  above).

## Re-running the overlap check

```
python3 data/independent_gold/check_no_overlap.py
```

Loads `data/train/train.jsonl`, `data/validation/validation.jsonl`, and
`data/gold/gold.jsonl`, then checks `independent_gold.jsonl` against all
three on three axes: record `id`, the underlying GroceryDB `original_ID`
(the check that actually matters — an existing split's id is
`gdb_<original_id>`, while this file carries the same `original_id` in its
own `source_product_id` field), and case-insensitive `product_name`. Prints
`PASS` and exits 0 on success, or `FAIL` with the specific overlapping
ids/names and exits 1 otherwise. Current result: **PASS** — 127 GroceryDB
`source_product_id`s in this file, zero of which appear among the 1,355
used by the existing splits.
