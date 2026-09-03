// lib/lexicon.ts
//
// SugarShield sugar knowledge layer.
//
// This is the deterministic ground truth for ingredient detection. It is
// intentionally kept separate from risk *classification* (see riskEngine.ts):
// finding "milk" tells you contains_natural_sugar=true, it does NOT by
// itself mean risk_level=HIGH. Factual detection and risk judgment are two
// different steps.
//
// Two taxonomies live on every entry, deliberately kept separate:
//   - `category`  — the 5 FUNCTIONAL buckets riskEngine.ts scores against
//                    (added_sugar / hidden_sugar / artificial_sweetener /
//                    sugar_alcohol / natural_sugar_context). Changing this
//                    changes product behavior (contains_* flags, scoring).
//   - `subcategory` — an 8-way display/audit taxonomy (added sugars, syrups,
//                    glucose/fructose derivatives, malt-derived sweeteners,
//                    fruit concentrates used as sweeteners, sugar alcohols,
//                    artificial/non-nutritive sweeteners, natural-sugar
//                    context) for lexicon review and documentation. Purely
//                    organizational — riskEngine.ts never reads it.
//
// `canonical` collapses true spelling/naming synonyms of the SAME substance
// (e.g. "hfcs", "high-fructose corn syrup" -> "high fructose corn syrup") so
// detectedSugars/artificialSweeteners output one consistent name regardless
// of which label variant matched. Materially different products (brown
// sugar vs. turbinado vs. demerara) get their own canonical name — they are
// not synonyms just because they're all "added sugar".

export type SugarCategory =
  | 'added_sugar'
  | 'hidden_sugar'
  | 'artificial_sweetener'
  | 'sugar_alcohol'
  | 'natural_sugar_context';

export type SugarSubcategory =
  | 'added_sugar_basic'
  | 'syrup'
  | 'glucose_fructose_derivative'
  | 'malt_derived'
  | 'fruit_concentrate_sweetener'
  | 'sugar_alcohol'
  | 'artificial_nonnutritive'
  | 'natural_sugar_context';

export interface LexiconEntry {
  term: string; // the exact label alias to match (lowercase)
  canonical: string; // canonical display name this alias collapses to
  category: SugarCategory;
  subcategory: SugarSubcategory;
  reason: string;
}

// ---------------------------------------------------------------------------
// 1. ADDED SUGARS — basic/refined sugars, visible and commonly recognized
// ---------------------------------------------------------------------------
const ADDED_SUGAR: LexiconEntry[] = [
  { term: 'sugar', canonical: 'sugar', reason: 'Standard refined sugar (sucrose).', category: 'added_sugar', subcategory: 'added_sugar_basic' },
  { term: 'added sugar', canonical: 'sugar', reason: 'Explicitly labeled added sugar.', category: 'added_sugar', subcategory: 'added_sugar_basic' },
  { term: 'cane sugar', canonical: 'sugar', reason: 'Refined sugar from sugar cane.', category: 'added_sugar', subcategory: 'added_sugar_basic' },
  { term: 'granulated sugar', canonical: 'sugar', reason: 'Standard refined table sugar.', category: 'added_sugar', subcategory: 'added_sugar_basic' },
  { term: 'table sugar', canonical: 'sugar', reason: 'Standard refined table sugar.', category: 'added_sugar', subcategory: 'added_sugar_basic' },
  { term: 'white sugar', canonical: 'sugar', reason: 'Standard refined table sugar.', category: 'added_sugar', subcategory: 'added_sugar_basic' },
  { term: 'refined sugar', canonical: 'sugar', reason: 'Standard refined table sugar.', category: 'added_sugar', subcategory: 'added_sugar_basic' },
  { term: 'beet sugar', canonical: 'sugar', reason: 'Refined sugar from sugar beets, chemically identical to cane sugar.', category: 'added_sugar', subcategory: 'added_sugar_basic' },
  { term: 'caster sugar', canonical: 'sugar', reason: 'Finely ground refined sugar.', category: 'added_sugar', subcategory: 'added_sugar_basic' },
  { term: 'superfine sugar', canonical: 'sugar', reason: 'Finely ground refined sugar.', category: 'added_sugar', subcategory: 'added_sugar_basic' },
  { term: 'sucrose', canonical: 'sugar', reason: 'Chemical name for table sugar.', category: 'added_sugar', subcategory: 'added_sugar_basic' },
  { term: 'brown sugar', canonical: 'brown sugar', reason: 'Refined sugar retaining some molasses.', category: 'added_sugar', subcategory: 'added_sugar_basic' },
  { term: 'light brown sugar', canonical: 'brown sugar', reason: 'Refined sugar retaining some molasses.', category: 'added_sugar', subcategory: 'added_sugar_basic' },
  { term: 'dark brown sugar', canonical: 'brown sugar', reason: 'Refined sugar retaining more molasses.', category: 'added_sugar', subcategory: 'added_sugar_basic' },
  { term: 'raw sugar', canonical: 'raw sugar', reason: 'Minimally refined cane sugar, still added sugar.', category: 'added_sugar', subcategory: 'added_sugar_basic' },
  { term: 'turbinado sugar', canonical: 'turbinado sugar', reason: 'Partially refined cane sugar.', category: 'added_sugar', subcategory: 'added_sugar_basic' },
  { term: 'demerara sugar', canonical: 'demerara sugar', reason: 'Partially refined cane sugar with a light molasses coating.', category: 'added_sugar', subcategory: 'added_sugar_basic' },
  { term: 'muscovado sugar', canonical: 'muscovado sugar', reason: 'Unrefined cane sugar high in molasses.', category: 'added_sugar', subcategory: 'added_sugar_basic' },
  { term: 'powdered sugar', canonical: 'powdered sugar', reason: 'Finely ground refined sugar.', category: 'added_sugar', subcategory: 'added_sugar_basic' },
  { term: "confectioner's sugar", canonical: 'powdered sugar', reason: 'Finely ground refined sugar.', category: 'added_sugar', subcategory: 'added_sugar_basic' },
  { term: 'confectioners sugar', canonical: 'powdered sugar', reason: 'Finely ground refined sugar.', category: 'added_sugar', subcategory: 'added_sugar_basic' },
  { term: 'icing sugar', canonical: 'powdered sugar', reason: 'Finely ground refined sugar.', category: 'added_sugar', subcategory: 'added_sugar_basic' },
  { term: 'honey', canonical: 'honey', reason: 'Natural sweetener that still counts as added sugar in a recipe.', category: 'added_sugar', subcategory: 'added_sugar_basic' },
  { term: 'coconut sugar', canonical: 'coconut sugar', reason: 'Added sugar derived from coconut palm sap.', category: 'added_sugar', subcategory: 'added_sugar_basic' },
  { term: 'coconut palm sugar', canonical: 'coconut sugar', reason: 'Added sugar derived from coconut palm sap.', category: 'added_sugar', subcategory: 'added_sugar_basic' },
  { term: 'coconut nectar', canonical: 'coconut nectar', reason: 'Added sugar syrup derived from coconut palm sap.', category: 'added_sugar', subcategory: 'added_sugar_basic' },
  { term: 'palm sugar', canonical: 'palm sugar', reason: 'Added sugar derived from palm sap.', category: 'added_sugar', subcategory: 'added_sugar_basic' },
  { term: 'date sugar', canonical: 'date sugar', reason: 'Added sugar made from dried, ground dates.', category: 'added_sugar', subcategory: 'added_sugar_basic' },
  { term: 'jaggery', canonical: 'jaggery', reason: 'Unrefined cane/palm sugar, common in South Asian cooking.', category: 'added_sugar', subcategory: 'added_sugar_basic' },
  { term: 'gur', canonical: 'jaggery', reason: 'Hindi/Urdu name for jaggery, an unrefined cane sugar.', category: 'added_sugar', subcategory: 'added_sugar_basic' },
  { term: 'panela', canonical: 'panela', reason: 'Unrefined whole cane sugar, common in Latin American cooking.', category: 'added_sugar', subcategory: 'added_sugar_basic' },
  { term: 'piloncillo', canonical: 'panela', reason: 'Mexican name for unrefined whole cane sugar (panela).', category: 'added_sugar', subcategory: 'added_sugar_basic' },
  { term: 'rapadura', canonical: 'panela', reason: 'Brazilian name for unrefined whole cane sugar (panela).', category: 'added_sugar', subcategory: 'added_sugar_basic' },
  { term: 'liquid sugar', canonical: 'liquid sugar', reason: 'Dissolved refined sugar used as a sweetener.', category: 'added_sugar', subcategory: 'added_sugar_basic' },
  // Deliberately NOT flagged: "caramel color" (E150) is a coloring agent used
  // in trace amounts (classically in diet sodas) and carries negligible
  // dietary sugar — flagging it caused false "contains added sugar" warnings
  // on products with zero real sugar. Plain "caramel" as a confection/sauce
  // ingredient is genuinely sugar-based but too ambiguous to disambiguate
  // from "caramel color" with simple term matching, so both are omitted
  // rather than over-warn on every diet soda and savory sauce.
];

// ---------------------------------------------------------------------------
// 2. SYRUPS
// ---------------------------------------------------------------------------
const SYRUPS: LexiconEntry[] = [
  { term: 'corn syrup', canonical: 'corn syrup', reason: 'Liquid sweetener made from corn starch.', category: 'added_sugar', subcategory: 'syrup' },
  { term: 'light corn syrup', canonical: 'corn syrup', reason: 'Liquid sweetener made from corn starch.', category: 'added_sugar', subcategory: 'syrup' },
  { term: 'dark corn syrup', canonical: 'corn syrup', reason: 'Liquid sweetener made from corn starch, with added molasses/caramel.', category: 'added_sugar', subcategory: 'syrup' },
  { term: 'high fructose corn syrup', canonical: 'high fructose corn syrup', reason: 'Highly processed corn syrup, high in fructose.', category: 'added_sugar', subcategory: 'syrup' },
  { term: 'high-fructose corn syrup', canonical: 'high fructose corn syrup', reason: 'Highly processed corn syrup, high in fructose.', category: 'added_sugar', subcategory: 'syrup' },
  { term: 'hfcs', canonical: 'high fructose corn syrup', reason: 'Abbreviation for high fructose corn syrup.', category: 'added_sugar', subcategory: 'syrup' },
  { term: 'maple syrup', canonical: 'maple syrup', reason: 'Natural syrup used as an added sweetener.', category: 'added_sugar', subcategory: 'syrup' },
  { term: 'golden syrup', canonical: 'golden syrup', reason: 'Refined cane/beet sugar syrup.', category: 'added_sugar', subcategory: 'syrup' },
  { term: 'treacle', canonical: 'treacle', reason: 'Refined sugar syrup byproduct, similar to molasses.', category: 'added_sugar', subcategory: 'syrup' },
  { term: "refiner's syrup", canonical: 'treacle', reason: "Byproduct syrup of sugar refining (treacle).", category: 'added_sugar', subcategory: 'syrup' },
  { term: 'agave syrup', canonical: 'agave syrup', reason: 'Concentrated syrup from agave, very high in fructose.', category: 'added_sugar', subcategory: 'syrup' },
  { term: 'agave nectar', canonical: 'agave syrup', reason: 'Concentrated syrup from agave, very high in fructose.', category: 'added_sugar', subcategory: 'syrup' },
  { term: 'blue agave syrup', canonical: 'agave syrup', reason: 'Concentrated syrup from agave, very high in fructose.', category: 'added_sugar', subcategory: 'syrup' },
  { term: 'molasses', canonical: 'molasses', reason: 'Byproduct of refining sugar cane or beets.', category: 'added_sugar', subcategory: 'syrup' },
  { term: 'blackstrap molasses', canonical: 'molasses', reason: 'Concentrated sugar-cane byproduct.', category: 'added_sugar', subcategory: 'syrup' },
  { term: 'cane syrup', canonical: 'cane syrup', reason: 'Syrup made by boiling down sugar cane juice.', category: 'added_sugar', subcategory: 'syrup' },
  { term: 'sorghum syrup', canonical: 'sorghum syrup', reason: 'Added sugar syrup from sorghum cane.', category: 'added_sugar', subcategory: 'syrup' },
  { term: 'sorghum molasses', canonical: 'sorghum syrup', reason: 'Added sugar syrup from sorghum cane.', category: 'added_sugar', subcategory: 'syrup' },
  { term: 'date syrup', canonical: 'date syrup', reason: 'Added sugar syrup made from dates.', category: 'added_sugar', subcategory: 'syrup' },
  { term: 'invert sugar', canonical: 'invert sugar', reason: 'Processed liquid sugar blend of glucose and fructose.', category: 'added_sugar', subcategory: 'syrup' },
  { term: 'inverted sugar syrup', canonical: 'invert sugar', reason: 'Processed liquid sugar blend of glucose and fructose.', category: 'added_sugar', subcategory: 'syrup' },
];

// ---------------------------------------------------------------------------
// 3. GLUCOSE / FRUCTOSE DERIVATIVES — simple sugars, often used industrially
// ---------------------------------------------------------------------------
const GLUCOSE_FRUCTOSE_DERIVATIVES: LexiconEntry[] = [
  { term: 'glucose', canonical: 'glucose', reason: 'Simple sugar, common added sweetener.', category: 'added_sugar', subcategory: 'glucose_fructose_derivative' },
  { term: 'glucose syrup', canonical: 'glucose syrup', reason: 'Liquid glucose sweetener.', category: 'added_sugar', subcategory: 'glucose_fructose_derivative' },
  { term: 'glucose-fructose syrup', canonical: 'glucose-fructose syrup', reason: 'Blended liquid sweetener (the EU/UK equivalent of HFCS).', category: 'added_sugar', subcategory: 'glucose_fructose_derivative' },
  { term: 'isoglucose', canonical: 'glucose-fructose syrup', reason: 'EU regulatory name for a glucose-fructose syrup equivalent to HFCS.', category: 'added_sugar', subcategory: 'glucose_fructose_derivative' },
  { term: 'dextrose', canonical: 'dextrose', reason: 'Simple sugar chemically identical to blood glucose.', category: 'added_sugar', subcategory: 'glucose_fructose_derivative' },
  { term: 'dextrose monohydrate', canonical: 'dextrose', reason: 'Simple sugar chemically identical to blood glucose.', category: 'added_sugar', subcategory: 'glucose_fructose_derivative' },
  { term: 'anhydrous dextrose', canonical: 'dextrose', reason: 'Simple sugar chemically identical to blood glucose.', category: 'added_sugar', subcategory: 'glucose_fructose_derivative' },
  { term: 'fructose', canonical: 'fructose', reason: 'Fruit sugar, often added in crystalline form.', category: 'added_sugar', subcategory: 'glucose_fructose_derivative' },
  { term: 'crystalline fructose', canonical: 'fructose', reason: 'Highly concentrated added fructose.', category: 'added_sugar', subcategory: 'glucose_fructose_derivative' },
  { term: 'levulose', canonical: 'fructose', reason: 'Older chemical name for fructose.', category: 'added_sugar', subcategory: 'glucose_fructose_derivative' },
  { term: 'maltose', canonical: 'maltose', reason: 'Malt sugar, a disaccharide sweetener.', category: 'added_sugar', subcategory: 'glucose_fructose_derivative' },
  { term: 'malt sugar', canonical: 'maltose', reason: 'Malt sugar, a disaccharide sweetener.', category: 'added_sugar', subcategory: 'glucose_fructose_derivative' },
  { term: 'galactose', canonical: 'galactose', reason: 'Simple sugar, sometimes added or a hydrolysis product of lactose.', category: 'added_sugar', subcategory: 'glucose_fructose_derivative' },
  { term: 'trehalose', canonical: 'trehalose', reason: 'Disaccharide sweetener used as a stabilizer/sweetener.', category: 'added_sugar', subcategory: 'glucose_fructose_derivative' },
];

// ---------------------------------------------------------------------------
// 4. MALT-DERIVED SWEETENERS
// ---------------------------------------------------------------------------
const MALT_DERIVED: LexiconEntry[] = [
  { term: 'malt syrup', canonical: 'malt syrup', reason: 'Sugar syrup derived from malted grain.', category: 'added_sugar', subcategory: 'malt_derived' },
  { term: 'barley malt', canonical: 'barley malt syrup', reason: 'Sugar syrup derived from malted barley.', category: 'added_sugar', subcategory: 'malt_derived' },
  { term: 'barley malt syrup', canonical: 'barley malt syrup', reason: 'Sugar syrup derived from malted barley.', category: 'added_sugar', subcategory: 'malt_derived' },
  { term: 'malted barley', canonical: 'barley malt syrup', reason: 'Sugar syrup derived from malted barley.', category: 'added_sugar', subcategory: 'malt_derived' },
  { term: 'malt extract', canonical: 'malt extract', reason: 'Concentrated malt-derived sweetener/flavoring.', category: 'added_sugar', subcategory: 'malt_derived' },
  { term: 'diastatic malt powder', canonical: 'malt extract', reason: 'Malt-derived sweetener/leavening aid.', category: 'added_sugar', subcategory: 'malt_derived' },
  { term: 'malt', canonical: 'malt', reason: 'Malt-based sweetener or flavoring, often carries sugar.', category: 'added_sugar', subcategory: 'malt_derived' },
];

// ---------------------------------------------------------------------------
// 5. FRUIT CONCENTRATES USED AS SWEETENERS
// ---------------------------------------------------------------------------
const FRUIT_CONCENTRATE_SWEETENERS: LexiconEntry[] = [
  { term: 'fruit juice concentrate', canonical: 'fruit juice concentrate', reason: 'Concentrated fruit sugar with fiber removed, functions like added sugar.', category: 'hidden_sugar', subcategory: 'fruit_concentrate_sweetener' },
  { term: 'concentrated fruit juice', canonical: 'fruit juice concentrate', reason: 'Concentrated fruit sugar with fiber removed, functions like added sugar.', category: 'hidden_sugar', subcategory: 'fruit_concentrate_sweetener' },
  { term: 'dried fruit juice concentrate', canonical: 'fruit juice concentrate', reason: 'Concentrated fruit sugar with fiber removed, functions like added sugar.', category: 'hidden_sugar', subcategory: 'fruit_concentrate_sweetener' },
  { term: 'fruit juice from concentrate', canonical: 'fruit juice concentrate', reason: 'Reconstituted concentrated fruit sugar.', category: 'hidden_sugar', subcategory: 'fruit_concentrate_sweetener' },
  { term: 'apple juice concentrate', canonical: 'apple juice concentrate', reason: 'Concentrated fruit sugar used as a hidden sweetener.', category: 'hidden_sugar', subcategory: 'fruit_concentrate_sweetener' },
  { term: 'pear juice concentrate', canonical: 'pear juice concentrate', reason: 'Concentrated fruit sugar used as a hidden sweetener.', category: 'hidden_sugar', subcategory: 'fruit_concentrate_sweetener' },
  { term: 'grape juice concentrate', canonical: 'grape juice concentrate', reason: 'Concentrated fruit sugar used as a hidden sweetener.', category: 'hidden_sugar', subcategory: 'fruit_concentrate_sweetener' },
  { term: 'white grape juice concentrate', canonical: 'white grape juice concentrate', reason: 'Concentrated fruit sugar used as a hidden sweetener.', category: 'hidden_sugar', subcategory: 'fruit_concentrate_sweetener' },
  { term: 'pineapple juice concentrate', canonical: 'pineapple juice concentrate', reason: 'Concentrated fruit sugar used as a hidden sweetener.', category: 'hidden_sugar', subcategory: 'fruit_concentrate_sweetener' },
  { term: 'pear puree concentrate', canonical: 'pear juice concentrate', reason: 'Concentrated fruit sugar used as a hidden sweetener/binder.', category: 'hidden_sugar', subcategory: 'fruit_concentrate_sweetener' },
  { term: 'cane juice', canonical: 'evaporated cane juice', reason: 'Marketing name for added cane sugar.', category: 'hidden_sugar', subcategory: 'fruit_concentrate_sweetener' },
  { term: 'evaporated cane juice', canonical: 'evaporated cane juice', reason: 'Regulatory-flagged rebrand of added cane sugar.', category: 'hidden_sugar', subcategory: 'fruit_concentrate_sweetener' },
  { term: 'dehydrated cane juice', canonical: 'evaporated cane juice', reason: 'Rebrand of added cane sugar.', category: 'hidden_sugar', subcategory: 'fruit_concentrate_sweetener' },
  { term: 'organic cane juice', canonical: 'evaporated cane juice', reason: 'Rebrand of added cane sugar.', category: 'hidden_sugar', subcategory: 'fruit_concentrate_sweetener' },
];

// ---------------------------------------------------------------------------
// Hidden-sugar processing signals that aren't syrups/concentrates
// ---------------------------------------------------------------------------
const HIDDEN_SUGAR_OTHER: LexiconEntry[] = [
  { term: 'maltodextrin', canonical: 'maltodextrin', reason: 'Processed carbohydrate that spikes blood sugar like sugar, often used as a filler or sweetener.', category: 'hidden_sugar', subcategory: 'glucose_fructose_derivative' },
  { term: 'corn syrup solids', canonical: 'corn syrup solids', reason: 'Dried corn syrup, a concentrated hidden sugar.', category: 'hidden_sugar', subcategory: 'syrup' },
  { term: 'brown rice syrup', canonical: 'brown rice syrup', reason: 'Processed sugar syrup marketed as a "natural" alternative.', category: 'hidden_sugar', subcategory: 'syrup' },
  { term: 'rice syrup', canonical: 'rice syrup', reason: 'Processed sugar syrup from rice starch.', category: 'hidden_sugar', subcategory: 'syrup' },
  { term: 'rice bran syrup', canonical: 'rice syrup', reason: 'Processed sugar syrup from rice bran starch.', category: 'hidden_sugar', subcategory: 'syrup' },
  { term: 'tapioca syrup', canonical: 'tapioca syrup', reason: 'Processed sugar syrup from tapioca starch.', category: 'hidden_sugar', subcategory: 'syrup' },
  { term: 'dextrin', canonical: 'dextrin', reason: 'Processed starch derivative used as a hidden sweetener/thickener.', category: 'hidden_sugar', subcategory: 'glucose_fructose_derivative' },
  { term: 'tapioca dextrin', canonical: 'dextrin', reason: 'Processed starch derivative used as a hidden sweetener/thickener.', category: 'hidden_sugar', subcategory: 'glucose_fructose_derivative' },
  { term: 'corn dextrin', canonical: 'dextrin', reason: 'Processed starch derivative used as a hidden sweetener/thickener.', category: 'hidden_sugar', subcategory: 'glucose_fructose_derivative' },
];

// ---------------------------------------------------------------------------
// 6. SUGAR ALCOHOLS / POLYOLS — non-nutritive/low-nutritive
// ---------------------------------------------------------------------------
const SUGAR_ALCOHOL: LexiconEntry[] = [
  { term: 'erythritol', canonical: 'erythritol', reason: 'Sugar alcohol with negligible calories/glycemic impact.', category: 'sugar_alcohol', subcategory: 'sugar_alcohol' },
  { term: 'xylitol', canonical: 'xylitol', reason: 'Sugar alcohol sweetener.', category: 'sugar_alcohol', subcategory: 'sugar_alcohol' },
  { term: 'sorbitol', canonical: 'sorbitol', reason: 'Sugar alcohol sweetener.', category: 'sugar_alcohol', subcategory: 'sugar_alcohol' },
  { term: 'maltitol', canonical: 'maltitol', reason: 'Sugar alcohol sweetener with a moderate glycemic impact.', category: 'sugar_alcohol', subcategory: 'sugar_alcohol' },
  { term: 'maltitol syrup', canonical: 'maltitol', reason: 'Sugar alcohol sweetener with a moderate glycemic impact.', category: 'sugar_alcohol', subcategory: 'sugar_alcohol' },
  { term: 'mannitol', canonical: 'mannitol', reason: 'Sugar alcohol sweetener.', category: 'sugar_alcohol', subcategory: 'sugar_alcohol' },
  { term: 'isomalt', canonical: 'isomalt', reason: 'Sugar alcohol sweetener.', category: 'sugar_alcohol', subcategory: 'sugar_alcohol' },
  { term: 'lactitol', canonical: 'lactitol', reason: 'Sugar alcohol sweetener.', category: 'sugar_alcohol', subcategory: 'sugar_alcohol' },
  { term: 'hydrogenated starch hydrolysate', canonical: 'hydrogenated starch hydrolysate', reason: 'Mixture of sugar alcohols used as a bulk sweetener.', category: 'sugar_alcohol', subcategory: 'sugar_alcohol' },
];

// ---------------------------------------------------------------------------
// 7. ARTIFICIAL / NON-NUTRITIVE SWEETENERS (synthetic and plant-derived)
// ---------------------------------------------------------------------------
const ARTIFICIAL_SWEETENER: LexiconEntry[] = [
  { term: 'aspartame', canonical: 'aspartame', reason: 'Artificial non-nutritive sweetener (~200x sweeter than sugar).', category: 'artificial_sweetener', subcategory: 'artificial_nonnutritive' },
  { term: 'sucralose', canonical: 'sucralose', reason: 'Artificial non-nutritive sweetener.', category: 'artificial_sweetener', subcategory: 'artificial_nonnutritive' },
  { term: 'saccharin', canonical: 'saccharin', reason: 'Artificial non-nutritive sweetener.', category: 'artificial_sweetener', subcategory: 'artificial_nonnutritive' },
  { term: 'acesulfame potassium', canonical: 'acesulfame potassium', reason: 'Artificial non-nutritive sweetener.', category: 'artificial_sweetener', subcategory: 'artificial_nonnutritive' },
  { term: 'acesulfame k', canonical: 'acesulfame potassium', reason: 'Artificial non-nutritive sweetener.', category: 'artificial_sweetener', subcategory: 'artificial_nonnutritive' },
  { term: 'ace-k', canonical: 'acesulfame potassium', reason: 'Artificial non-nutritive sweetener.', category: 'artificial_sweetener', subcategory: 'artificial_nonnutritive' },
  { term: 'neotame', canonical: 'neotame', reason: 'Artificial non-nutritive sweetener related to aspartame.', category: 'artificial_sweetener', subcategory: 'artificial_nonnutritive' },
  { term: 'advantame', canonical: 'advantame', reason: 'Artificial non-nutritive sweetener related to aspartame.', category: 'artificial_sweetener', subcategory: 'artificial_nonnutritive' },
  { term: 'cyclamate', canonical: 'cyclamate', reason: 'Artificial non-nutritive sweetener.', category: 'artificial_sweetener', subcategory: 'artificial_nonnutritive' },
  { term: 'sodium cyclamate', canonical: 'cyclamate', reason: 'Artificial non-nutritive sweetener.', category: 'artificial_sweetener', subcategory: 'artificial_nonnutritive' },
  { term: 'tagatose', canonical: 'tagatose', reason: 'Low-calorie rare sugar used as a non-nutritive sweetener.', category: 'artificial_sweetener', subcategory: 'artificial_nonnutritive' },
];

const PLANT_SWEETENER: LexiconEntry[] = [
  { term: 'stevia', canonical: 'stevia', reason: 'Plant-derived non-nutritive sweetener.', category: 'artificial_sweetener', subcategory: 'artificial_nonnutritive' },
  { term: 'stevia leaf extract', canonical: 'stevia', reason: 'Plant-derived non-nutritive sweetener.', category: 'artificial_sweetener', subcategory: 'artificial_nonnutritive' },
  { term: 'stevia extract', canonical: 'stevia', reason: 'Plant-derived non-nutritive sweetener.', category: 'artificial_sweetener', subcategory: 'artificial_nonnutritive' },
  { term: 'rebaudioside a', canonical: 'stevia', reason: 'Purified stevia sweetener compound.', category: 'artificial_sweetener', subcategory: 'artificial_nonnutritive' },
  { term: 'reb a', canonical: 'stevia', reason: 'Purified stevia sweetener compound.', category: 'artificial_sweetener', subcategory: 'artificial_nonnutritive' },
  { term: 'monk fruit', canonical: 'monk fruit', reason: 'Plant-derived non-nutritive sweetener.', category: 'artificial_sweetener', subcategory: 'artificial_nonnutritive' },
  { term: 'monk fruit extract', canonical: 'monk fruit', reason: 'Plant-derived non-nutritive sweetener.', category: 'artificial_sweetener', subcategory: 'artificial_nonnutritive' },
  { term: 'luo han guo', canonical: 'monk fruit', reason: 'Monk fruit, a plant-derived non-nutritive sweetener.', category: 'artificial_sweetener', subcategory: 'artificial_nonnutritive' },
  { term: 'allulose', canonical: 'allulose', reason: 'Rare sugar with minimal caloric/glycemic impact, used as a sweetener.', category: 'artificial_sweetener', subcategory: 'artificial_nonnutritive' },
];

// ---------------------------------------------------------------------------
// 8. NATURAL SUGAR CONTEXT — naturally occurring sugar sources.
// Detecting these sets contains_natural_sugar=true but never by itself
// raises risk_level. This is the "don't over-warn on plain Greek yogurt"
// safeguard.
// ---------------------------------------------------------------------------
const NATURAL_SUGAR_CONTEXT: LexiconEntry[] = [
  { term: 'milk', canonical: 'milk', reason: 'Contains naturally occurring lactose.', category: 'natural_sugar_context', subcategory: 'natural_sugar_context' },
  { term: 'whole milk', canonical: 'milk', reason: 'Contains naturally occurring lactose.', category: 'natural_sugar_context', subcategory: 'natural_sugar_context' },
  { term: 'nonfat milk', canonical: 'milk', reason: 'Contains naturally occurring lactose.', category: 'natural_sugar_context', subcategory: 'natural_sugar_context' },
  { term: 'skim milk', canonical: 'milk', reason: 'Contains naturally occurring lactose.', category: 'natural_sugar_context', subcategory: 'natural_sugar_context' },
  { term: 'lactose', canonical: 'lactose', reason: 'Naturally occurring milk sugar.', category: 'natural_sugar_context', subcategory: 'natural_sugar_context' },
  { term: 'cultured milk', canonical: 'milk', reason: 'Contains naturally occurring lactose.', category: 'natural_sugar_context', subcategory: 'natural_sugar_context' },
  { term: 'cultured pasteurized nonfat milk', canonical: 'milk', reason: 'Plain yogurt base; naturally occurring lactose only.', category: 'natural_sugar_context', subcategory: 'natural_sugar_context' },
  { term: 'yogurt cultures', canonical: 'yogurt cultures', reason: 'Fermentation culture, not an added sweetener.', category: 'natural_sugar_context', subcategory: 'natural_sugar_context' },
  { term: 'coconut water', canonical: 'coconut water', reason: 'Contains naturally occurring fruit sugars.', category: 'natural_sugar_context', subcategory: 'natural_sugar_context' },
  { term: 'apple', canonical: 'whole fruit', reason: 'Whole-fruit form; naturally occurring sugar with fiber intact.', category: 'natural_sugar_context', subcategory: 'natural_sugar_context' },
  { term: 'banana', canonical: 'whole fruit', reason: 'Whole-fruit form; naturally occurring sugar with fiber intact.', category: 'natural_sugar_context', subcategory: 'natural_sugar_context' },
  { term: 'orange', canonical: 'whole fruit', reason: 'Whole-fruit form; naturally occurring sugar with fiber intact.', category: 'natural_sugar_context', subcategory: 'natural_sugar_context' },
  { term: 'strawberry', canonical: 'whole fruit', reason: 'Whole-fruit form; naturally occurring sugar with fiber intact.', category: 'natural_sugar_context', subcategory: 'natural_sugar_context' },
  { term: 'blueberry', canonical: 'whole fruit', reason: 'Whole-fruit form; naturally occurring sugar with fiber intact.', category: 'natural_sugar_context', subcategory: 'natural_sugar_context' },
  { term: 'raisin', canonical: 'dried fruit', reason: 'Dried whole fruit; naturally occurring sugar with fiber intact.', category: 'natural_sugar_context', subcategory: 'natural_sugar_context' },
  { term: 'date', canonical: 'dried fruit', reason: 'Whole fruit; naturally occurring sugar with fiber intact.', category: 'natural_sugar_context', subcategory: 'natural_sugar_context' },
  { term: '100% fruit juice', canonical: 'fruit juice (not concentrate)', reason: 'Naturally occurring fruit sugar, not a concentrate.', category: 'natural_sugar_context', subcategory: 'natural_sugar_context' },
];

export const LEXICON: LexiconEntry[] = [
  ...ADDED_SUGAR,
  ...SYRUPS,
  ...GLUCOSE_FRUCTOSE_DERIVATIVES,
  ...MALT_DERIVED,
  ...FRUIT_CONCENTRATE_SWEETENERS,
  ...HIDDEN_SUGAR_OTHER,
  ...ARTIFICIAL_SWEETENER,
  ...PLANT_SWEETENER,
  ...SUGAR_ALCOHOL,
  ...NATURAL_SUGAR_CONTEXT,
];

// Sort longest-term-first so multi-word terms are matched before their
// single-word substrings (e.g. "high fructose corn syrup" before "corn syrup").
export const LEXICON_BY_LENGTH: LexiconEntry[] = [...LEXICON].sort(
  (a, b) => b.term.length - a.term.length
);

export function getLexiconEntry(term: string): LexiconEntry | undefined {
  const lower = term.toLowerCase();
  return LEXICON.find((e) => e.term === lower);
}

// Legacy flat list, kept for backward compatibility with lib/sugarTerms.ts consumers.
export const ALL_SUGAR_RELATED_TERMS = LEXICON.filter(
  (e) => e.category !== 'natural_sugar_context'
).map((e) => e.term);
