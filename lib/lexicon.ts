// lib/lexicon.ts
//
// SugarShield sugar knowledge layer.
//
// This is the deterministic ground truth for ingredient detection. It is
// intentionally kept separate from risk *classification* (see riskEngine.ts):
// finding "milk" tells you contains_natural_sugar=true, it does NOT by
// itself mean risk_level=HIGH. Factual detection and risk judgment are two
// different steps.

export type SugarCategory =
  | 'added_sugar'
  | 'hidden_sugar'
  | 'artificial_sweetener'
  | 'sugar_alcohol'
  | 'natural_sugar_context';

export interface LexiconEntry {
  term: string;
  category: SugarCategory;
  reason: string;
}

// ---------------------------------------------------------------------------
// ADDED SUGARS — visible, commonly recognized as sugar by consumers
// ---------------------------------------------------------------------------
const ADDED_SUGAR: LexiconEntry[] = [
  { term: 'sugar', reason: 'Standard refined sugar (sucrose).', category: 'added_sugar' },
  { term: 'added sugar', reason: 'Explicitly labeled added sugar.', category: 'added_sugar' },
  { term: 'cane sugar', reason: 'Refined sugar from sugar cane.', category: 'added_sugar' },
  { term: 'brown sugar', reason: 'Refined sugar retaining some molasses.', category: 'added_sugar' },
  { term: 'raw sugar', reason: 'Minimally refined cane sugar, still added sugar.', category: 'added_sugar' },
  { term: 'turbinado sugar', reason: 'Partially refined cane sugar.', category: 'added_sugar' },
  { term: 'demerara sugar', reason: 'Partially refined cane sugar.', category: 'added_sugar' },
  { term: 'muscovado sugar', reason: 'Unrefined cane sugar high in molasses.', category: 'added_sugar' },
  { term: 'powdered sugar', reason: 'Finely ground refined sugar.', category: 'added_sugar' },
  { term: "confectioner's sugar", reason: 'Finely ground refined sugar.', category: 'added_sugar' },
  { term: 'icing sugar', reason: 'Finely ground refined sugar.', category: 'added_sugar' },
  { term: 'sucrose', reason: 'Chemical name for table sugar.', category: 'added_sugar' },
  { term: 'glucose', reason: 'Simple sugar, common added sweetener.', category: 'added_sugar' },
  { term: 'fructose', reason: 'Fruit sugar, often added in crystalline form.', category: 'added_sugar' },
  { term: 'crystalline fructose', reason: 'Highly concentrated added fructose.', category: 'added_sugar' },
  { term: 'dextrose', reason: 'Simple sugar chemically identical to blood glucose.', category: 'added_sugar' },
  { term: 'maltose', reason: 'Malt sugar, a disaccharide sweetener.', category: 'added_sugar' },
  { term: 'corn syrup', reason: 'Liquid sweetener made from corn starch.', category: 'added_sugar' },
  { term: 'high fructose corn syrup', reason: 'Highly processed corn syrup, high in fructose.', category: 'added_sugar' },
  { term: 'hfcs', reason: 'Abbreviation for high fructose corn syrup.', category: 'added_sugar' },
  { term: 'glucose syrup', reason: 'Liquid glucose sweetener.', category: 'added_sugar' },
  { term: 'glucose-fructose syrup', reason: 'Blended liquid sweetener.', category: 'added_sugar' },
  { term: 'maple syrup', reason: 'Natural syrup used as an added sweetener.', category: 'added_sugar' },
  { term: 'agave syrup', reason: 'Concentrated syrup from agave, very high in fructose.', category: 'added_sugar' },
  { term: 'agave nectar', reason: 'Concentrated syrup from agave, very high in fructose.', category: 'added_sugar' },
  { term: 'molasses', reason: 'Byproduct of refining sugar cane or beets.', category: 'added_sugar' },
  { term: 'blackstrap molasses', reason: 'Concentrated sugar-cane byproduct.', category: 'added_sugar' },
  { term: 'invert sugar', reason: 'Processed liquid sugar blend of glucose and fructose.', category: 'added_sugar' },
  { term: 'honey', reason: 'Natural sweetener that still counts as added sugar in a recipe.', category: 'added_sugar' },
  // Deliberately NOT flagged: "caramel color" (E150) is a coloring agent used
  // in trace amounts (classically in diet sodas) and carries negligible
  // dietary sugar — flagging it caused false "contains added sugar" warnings
  // on products with zero real sugar. Plain "caramel" as a confection/sauce
  // ingredient is genuinely sugar-based but too ambiguous to disambiguate
  // from "caramel color" with simple term matching, so both are omitted
  // rather than over-warn on every diet soda and savory sauce.
  { term: 'malt syrup', reason: 'Sugar syrup derived from malted grain.', category: 'added_sugar' },
  { term: 'barley malt', reason: 'Sugar syrup derived from malted barley.', category: 'added_sugar' },
  { term: 'barley malt syrup', reason: 'Sugar syrup derived from malted barley.', category: 'added_sugar' },
  { term: 'malt', reason: 'Malt-based sweetener or flavoring, often carries sugar.', category: 'added_sugar' },
  { term: 'coconut sugar', reason: 'Added sugar derived from coconut palm sap.', category: 'added_sugar' },
  { term: 'coconut nectar', reason: 'Added sugar syrup derived from coconut palm sap.', category: 'added_sugar' },
  { term: 'date sugar', reason: 'Added sugar made from dried, ground dates.', category: 'added_sugar' },
  { term: 'date syrup', reason: 'Added sugar syrup made from dates.', category: 'added_sugar' },
  { term: 'palm sugar', reason: 'Added sugar derived from palm sap.', category: 'added_sugar' },
  { term: 'sorghum syrup', reason: 'Added sugar syrup from sorghum cane.', category: 'added_sugar' },
  { term: 'golden syrup', reason: 'Refined cane/beet sugar syrup.', category: 'added_sugar' },
  { term: 'treacle', reason: 'Refined sugar syrup byproduct.', category: 'added_sugar' },
  { term: 'liquid sugar', reason: 'Dissolved refined sugar used as a sweetener.', category: 'added_sugar' },
  { term: 'refiner\'s syrup', reason: 'Byproduct syrup of sugar refining.', category: 'added_sugar' },
];

// ---------------------------------------------------------------------------
// HIDDEN SUGARS — added sugar in a form most consumers don't recognize
// ---------------------------------------------------------------------------
const HIDDEN_SUGAR: LexiconEntry[] = [
  { term: 'maltodextrin', reason: 'Processed carbohydrate that spikes blood sugar like sugar, often used as a filler or sweetener.', category: 'hidden_sugar' },
  { term: 'dextrin', reason: 'Processed starch derivative used as a hidden sweetener/thickener.', category: 'hidden_sugar' },
  { term: 'corn syrup solids', reason: 'Dried corn syrup, a concentrated hidden sugar.', category: 'hidden_sugar' },
  { term: 'brown rice syrup', reason: 'Processed sugar syrup marketed as a "natural" alternative.', category: 'hidden_sugar' },
  { term: 'rice syrup', reason: 'Processed sugar syrup from rice starch.', category: 'hidden_sugar' },
  { term: 'tapioca syrup', reason: 'Processed sugar syrup from tapioca starch.', category: 'hidden_sugar' },
  { term: 'cane juice', reason: 'Marketing name for added cane sugar.', category: 'hidden_sugar' },
  { term: 'evaporated cane juice', reason: 'Regulatory-flagged rebrand of added cane sugar.', category: 'hidden_sugar' },
  { term: 'dehydrated cane juice', reason: 'Rebrand of added cane sugar.', category: 'hidden_sugar' },
  { term: 'organic cane juice', reason: 'Rebrand of added cane sugar.', category: 'hidden_sugar' },
  { term: 'fruit juice concentrate', reason: 'Concentrated fruit sugar with fiber removed, functions like added sugar.', category: 'hidden_sugar' },
  { term: 'concentrated fruit juice', reason: 'Concentrated fruit sugar with fiber removed, functions like added sugar.', category: 'hidden_sugar' },
  { term: 'fruit juice from concentrate', reason: 'Reconstituted concentrated fruit sugar.', category: 'hidden_sugar' },
  { term: 'apple juice concentrate', reason: 'Concentrated fruit sugar used as a hidden sweetener.', category: 'hidden_sugar' },
  { term: 'pear juice concentrate', reason: 'Concentrated fruit sugar used as a hidden sweetener.', category: 'hidden_sugar' },
  { term: 'grape juice concentrate', reason: 'Concentrated fruit sugar used as a hidden sweetener.', category: 'hidden_sugar' },
  { term: 'white grape juice concentrate', reason: 'Concentrated fruit sugar used as a hidden sweetener.', category: 'hidden_sugar' },
];

// ---------------------------------------------------------------------------
// ARTIFICIAL / NON-NUTRITIVE SWEETENERS
// ---------------------------------------------------------------------------
const ARTIFICIAL_SWEETENER: LexiconEntry[] = [
  { term: 'aspartame', reason: 'Artificial non-nutritive sweetener (~200x sweeter than sugar).', category: 'artificial_sweetener' },
  { term: 'sucralose', reason: 'Artificial non-nutritive sweetener.', category: 'artificial_sweetener' },
  { term: 'saccharin', reason: 'Artificial non-nutritive sweetener.', category: 'artificial_sweetener' },
  { term: 'acesulfame potassium', reason: 'Artificial non-nutritive sweetener.', category: 'artificial_sweetener' },
  { term: 'acesulfame k', reason: 'Artificial non-nutritive sweetener.', category: 'artificial_sweetener' },
  { term: 'ace-k', reason: 'Artificial non-nutritive sweetener.', category: 'artificial_sweetener' },
  { term: 'neotame', reason: 'Artificial non-nutritive sweetener related to aspartame.', category: 'artificial_sweetener' },
  { term: 'advantame', reason: 'Artificial non-nutritive sweetener related to aspartame.', category: 'artificial_sweetener' },
  { term: 'cyclamate', reason: 'Artificial non-nutritive sweetener.', category: 'artificial_sweetener' },
];

const PLANT_SWEETENER: LexiconEntry[] = [
  { term: 'stevia', reason: 'Plant-derived non-nutritive sweetener.', category: 'artificial_sweetener' },
  { term: 'stevia leaf extract', reason: 'Plant-derived non-nutritive sweetener.', category: 'artificial_sweetener' },
  { term: 'rebaudioside a', reason: 'Purified stevia sweetener compound.', category: 'artificial_sweetener' },
  { term: 'reb a', reason: 'Purified stevia sweetener compound.', category: 'artificial_sweetener' },
  { term: 'monk fruit', reason: 'Plant-derived non-nutritive sweetener.', category: 'artificial_sweetener' },
  { term: 'monk fruit extract', reason: 'Plant-derived non-nutritive sweetener.', category: 'artificial_sweetener' },
  { term: 'luo han guo', reason: 'Monk fruit, a plant-derived non-nutritive sweetener.', category: 'artificial_sweetener' },
  { term: 'allulose', reason: 'Rare sugar with minimal caloric/glycemic impact, used as a sweetener.', category: 'artificial_sweetener' },
];

// ---------------------------------------------------------------------------
// SUGAR ALCOHOLS — non-nutritive/low-nutritive, grouped with sweeteners
// ---------------------------------------------------------------------------
const SUGAR_ALCOHOL: LexiconEntry[] = [
  { term: 'erythritol', reason: 'Sugar alcohol with negligible calories/glycemic impact.', category: 'sugar_alcohol' },
  { term: 'xylitol', reason: 'Sugar alcohol sweetener.', category: 'sugar_alcohol' },
  { term: 'sorbitol', reason: 'Sugar alcohol sweetener.', category: 'sugar_alcohol' },
  { term: 'maltitol', reason: 'Sugar alcohol sweetener with a moderate glycemic impact.', category: 'sugar_alcohol' },
  { term: 'mannitol', reason: 'Sugar alcohol sweetener.', category: 'sugar_alcohol' },
  { term: 'isomalt', reason: 'Sugar alcohol sweetener.', category: 'sugar_alcohol' },
  { term: 'lactitol', reason: 'Sugar alcohol sweetener.', category: 'sugar_alcohol' },
];

// ---------------------------------------------------------------------------
// NATURAL SUGAR CONTEXT — naturally occurring sugar sources.
// Detecting these sets contains_natural_sugar=true but never by itself
// raises risk_level. This is the "don't over-warn on plain Greek yogurt"
// safeguard.
// ---------------------------------------------------------------------------
const NATURAL_SUGAR_CONTEXT: LexiconEntry[] = [
  { term: 'milk', reason: 'Contains naturally occurring lactose.', category: 'natural_sugar_context' },
  { term: 'whole milk', reason: 'Contains naturally occurring lactose.', category: 'natural_sugar_context' },
  { term: 'nonfat milk', reason: 'Contains naturally occurring lactose.', category: 'natural_sugar_context' },
  { term: 'skim milk', reason: 'Contains naturally occurring lactose.', category: 'natural_sugar_context' },
  { term: 'lactose', reason: 'Naturally occurring milk sugar.', category: 'natural_sugar_context' },
  { term: 'cultured milk', reason: 'Contains naturally occurring lactose.', category: 'natural_sugar_context' },
  { term: 'cultured pasteurized nonfat milk', reason: 'Plain yogurt base; naturally occurring lactose only.', category: 'natural_sugar_context' },
  { term: 'yogurt cultures', reason: 'Fermentation culture, not an added sweetener.', category: 'natural_sugar_context' },
  { term: 'coconut water', reason: 'Contains naturally occurring fruit sugars.', category: 'natural_sugar_context' },
  { term: 'apple', reason: 'Whole-fruit form; naturally occurring sugar with fiber intact.', category: 'natural_sugar_context' },
  { term: 'banana', reason: 'Whole-fruit form; naturally occurring sugar with fiber intact.', category: 'natural_sugar_context' },
  { term: 'orange', reason: 'Whole-fruit form; naturally occurring sugar with fiber intact.', category: 'natural_sugar_context' },
  { term: 'strawberry', reason: 'Whole-fruit form; naturally occurring sugar with fiber intact.', category: 'natural_sugar_context' },
  { term: 'blueberry', reason: 'Whole-fruit form; naturally occurring sugar with fiber intact.', category: 'natural_sugar_context' },
  { term: 'raisin', reason: 'Dried whole fruit; naturally occurring sugar with fiber intact.', category: 'natural_sugar_context' },
  { term: 'date', reason: 'Whole fruit; naturally occurring sugar with fiber intact.', category: 'natural_sugar_context' },
  { term: '100% fruit juice', reason: 'Naturally occurring fruit sugar, not a concentrate.', category: 'natural_sugar_context' },
];

export const LEXICON: LexiconEntry[] = [
  ...ADDED_SUGAR,
  ...HIDDEN_SUGAR,
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
