// lib/riskEngine.ts
//
// SugarShield v2 deterministic hybrid engine.
//
// Pipeline (Part 13 of the SugarShield 2.0 goal):
//
//   raw ingredients text
//     -> normalization (lib/normalizeIngredients.ts)
//     -> deterministic sugar detection (lib/lexicon.ts, this file)
//     -> [optional fine-tuned model call — see ml/ for the research track]
//     -> reconciliation: deterministic detections always win. A model can
//        add nuance/explanation, but it can never make a known high-
//        confidence sugar term disappear from detectedSugars.
//     -> SugarShield result (this file's RiskEngineResult)
//
// In production (a Vercel serverless deployment) there is no persistent
// process to host a fine-tuned transformer, so the "hybrid" system that is
// actually live is this deterministic layer running alone — see
// ml/results/benchmark.json and the README for why the fine-tuned model is
// benchmarked offline rather than called at request time.

import { LEXICON_BY_LENGTH, LexiconEntry, SugarCategory } from './lexicon';
import { normalizeIngredients } from './normalizeIngredients';
import { normalizeText } from './normalizeText';
import { calculateConfidence, IngredientSource } from './confidence';

export type RiskLevel = 'SAFE' | 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH';
export type EvalMode = 'STRICT' | 'LENIENT';

export interface DetectionMatch {
  term: string; // the raw label alias that actually matched (e.g. "hfcs")
  canonical: string; // canonical display name (e.g. "high fructose corn syrup")
  category: SugarCategory;
  reason: string;
  index: number; // position in the normalized ingredient list
}

export interface RiskEngineResult {
  riskLevel: RiskLevel;
  score: number; // 0-100, higher = more sugar risk
  containsAddedSugar: boolean;
  containsHiddenSugar: boolean;
  containsArtificialSweetener: boolean;
  containsNaturalSugar: boolean;
  detectedSugars: string[];
  artificialSweeteners: string[];
  naturalSugarContext: string[];
  confidence: number; // 0-1
  confidenceLabel: 'HIGH' | 'MEDIUM' | 'LOW';
  explanation: string;
  matches: DetectionMatch[];
  mode: EvalMode;
  needsIngredients: boolean;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// A lexicon term like "confectioner's sugar" or "refiner's syrup" contains
// an apostrophe, but the tokens being matched against have already gone
// through normalizeText (via splitIngredients), which strips punctuation
// including apostrophes to a space. Matching the *raw* term's regex against
// a normalized token can never succeed in that case, silently disabling
// detection for every lexicon entry with an apostrophe. Normalizing the
// term the same way before compiling its regex keeps both sides in the
// same alphabet. Pre-compiled once at module load, longest-term-first, to
// avoid rebuilding a RegExp per token per lexicon entry on every call.
const COMPILED_LEXICON: { entry: LexiconEntry; re: RegExp }[] = LEXICON_BY_LENGTH.map((entry) => ({
  entry,
  re: new RegExp(`\\b${escapeRegex(normalizeText(entry.term))}\\b`),
}));

/** Finds the single longest (most specific) lexicon entry matching a token. */
function matchToken(token: string): LexiconEntry | undefined {
  for (const { entry, re } of COMPILED_LEXICON) {
    if (re.test(token)) return entry;
  }
  return undefined;
}

export function detectMatches(ingredientList: string[]): DetectionMatch[] {
  const matches: DetectionMatch[] = [];
  ingredientList.forEach((token, index) => {
    const entry = matchToken(token);
    if (entry) {
      matches.push({ term: entry.term, canonical: entry.canonical, category: entry.category, reason: entry.reason, index });
    }
  });
  return matches;
}

/** Dedupes by canonical name, e.g. "hfcs" and "high fructose corn syrup" collapse to one entry. */
function uniqueTerms(matches: DetectionMatch[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of matches) {
    if (!seen.has(m.canonical)) {
      seen.add(m.canonical);
      out.push(m.canonical);
    }
  }
  return out;
}

function scoreRisk(
  matches: DetectionMatch[],
  totalIngredients: number,
  mode: EvalMode
): { score: number; addedTerms: string[]; hiddenHit: boolean; prominent: boolean } {
  const addedMatches = matches.filter((m) => m.category === 'added_sugar' || m.category === 'hidden_sugar');
  const artificialMatches = matches.filter((m) => m.category === 'artificial_sweetener');
  const sugarAlcoholMatches = matches.filter((m) => m.category === 'sugar_alcohol');

  const addedTerms = uniqueTerms(addedMatches);
  const artificialTerms = uniqueTerms(artificialMatches);
  const sugarAlcoholTerms = uniqueTerms(sugarAlcoholMatches);

  const hasAnySignal = addedTerms.length > 0 || artificialTerms.length > 0 || sugarAlcoholTerms.length > 0;
  if (!hasAnySignal) {
    return { score: 0, addedTerms, hiddenHit: false, prominent: false };
  }

  let score = 0;

  // Added / hidden sugar count
  if (addedTerms.length >= 1) score += 30;
  if (addedTerms.length >= 2) score += 20;
  if (addedTerms.length >= 3) score += 10;
  if (addedTerms.length >= 4) score += Math.min(10, (addedTerms.length - 3) * 5);

  const hiddenHit = addedMatches.some((m) => m.category === 'hidden_sugar');
  if (hiddenHit) score += 15;

  // Prominence: an added/hidden sugar near the top of the ingredient list
  // means it makes up a larger share of the product by weight.
  let prominent = false;
  if (addedMatches.length > 0 && totalIngredients > 0) {
    const earliestIndex = Math.min(...addedMatches.map((m) => m.index));
    const threshold = Math.max(2, Math.ceil(totalIngredients * 0.2));
    if (earliestIndex < threshold) {
      prominent = true;
      score += 25;
    }
  }

  // Artificial sweeteners / sugar alcohols — weighted lower in lenient mode,
  // which is designed to distinguish "contains a sweetener" from "high risk".
  const artificialWeight = mode === 'STRICT' ? 20 : 8;
  const sugarAlcoholWeight = mode === 'STRICT' ? 10 : 4;
  score += Math.min(2, artificialTerms.length) * artificialWeight;
  score += Math.min(2, sugarAlcoholTerms.length) * sugarAlcoholWeight;

  return { score: Math.max(0, Math.min(100, score)), addedTerms, hiddenHit, prominent };
}

function riskLevelFromScore(score: number): RiskLevel {
  if (score >= 80) return 'VERY_HIGH';
  if (score >= 55) return 'HIGH';
  if (score >= 30) return 'MODERATE';
  if (score >= 10) return 'LOW';
  return 'SAFE';
}

function buildExplanation(
  addedTerms: string[],
  artificialTerms: string[],
  sugarAlcoholTerms: string[],
  hiddenHit: boolean,
  naturalTerms: string[],
  score: number
): string {
  if (score === 0) {
    if (naturalTerms.length > 0) {
      return 'No added sugar or artificial sweeteners detected. Naturally occurring sugars (e.g. lactose or whole-fruit sugar) may be present.';
    }
    return 'No sugar-related ingredients detected in the provided ingredient list.';
  }

  const parts: string[] = [];
  if (addedTerms.length > 0) {
    parts.push(
      `${addedTerms.length} added sugar source${addedTerms.length > 1 ? 's' : ''} detected (${addedTerms
        .slice(0, 3)
        .join(', ')}${addedTerms.length > 3 ? ', ...' : ''})`
    );
  }
  if (hiddenHit) {
    parts.push('includes a sugar source not obviously named "sugar"');
  }
  const sweeteners = [...artificialTerms, ...sugarAlcoholTerms];
  if (sweeteners.length > 0) {
    parts.push(`contains non-nutritive sweetener${sweeteners.length > 1 ? 's' : ''} (${sweeteners.slice(0, 3).join(', ')})`);
  }

  const text = parts.join('; ');
  return text.charAt(0).toUpperCase() + text.slice(1) + '.';
}

export interface AnalyzeOptions {
  source?: IngredientSource;
  mode?: EvalMode;
}

export function analyzeIngredientsText(rawIngredients: string, options: AnalyzeOptions = {}): RiskEngineResult {
  const mode: EvalMode = options.mode ?? 'STRICT';
  const source: IngredientSource = options.source ?? 'UNKNOWN';

  const { list } = normalizeIngredients(rawIngredients || '');
  const trimmedLength = (rawIngredients || '').trim().length;

  const needsIngredients = trimmedLength === 0;

  const matches = detectMatches(list);
  const { score, addedTerms, hiddenHit } = scoreRisk(matches, list.length, mode);

  const artificialMatches = matches.filter((m) => m.category === 'artificial_sweetener');
  const sugarAlcoholMatches = matches.filter((m) => m.category === 'sugar_alcohol');
  const naturalMatches = matches.filter((m) => m.category === 'natural_sugar_context');

  const artificialTerms = uniqueTerms(artificialMatches);
  const sugarAlcoholTerms = uniqueTerms(sugarAlcoholMatches);
  const naturalTerms = uniqueTerms(naturalMatches);

  const containsArtificialSweetener = artificialTerms.length > 0 || sugarAlcoholTerms.length > 0;
  const containsAddedSugar = addedTerms.length > 0;
  const containsHiddenSugar = hiddenHit;
  const containsNaturalSugar = naturalTerms.length > 0;

  const riskLevel = needsIngredients ? 'MODERATE' : riskLevelFromScore(score);

  const totalSignalMatches = addedTerms.length + artificialTerms.length + sugarAlcoholTerms.length;
  const { score: confidenceScore, label: confidenceLabel } = calculateConfidence(
    source,
    trimmedLength,
    totalSignalMatches
  );

  const explanation = needsIngredients
    ? 'No ingredients were provided, so SugarShield cannot verify sugar content. Defaulting to a cautious rating.'
    : buildExplanation(addedTerms, artificialTerms, sugarAlcoholTerms, hiddenHit, naturalTerms, score);

  return {
    riskLevel,
    score: needsIngredients ? 40 : score,
    containsAddedSugar,
    containsHiddenSugar,
    containsArtificialSweetener,
    containsNaturalSugar,
    detectedSugars: addedTerms,
    artificialSweeteners: [...artificialTerms, ...sugarAlcoholTerms],
    naturalSugarContext: naturalTerms,
    confidence: needsIngredients ? Math.min(confidenceScore, 0.3) : confidenceScore,
    confidenceLabel: needsIngredients ? 'LOW' : confidenceLabel,
    explanation,
    matches,
    mode,
    needsIngredients,
  };
}
