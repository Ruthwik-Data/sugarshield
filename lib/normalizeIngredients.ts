// lib/normalizeIngredients.ts
//
// Splits a raw ingredients string into an ordered list of normalized
// ingredient tokens. Ingredient lists are legally ordered by descending
// weight, so preserving order lets the risk engine reason about how
// prominent a sugar source is (e.g. "sugar" as ingredient #2 vs #14).

import { normalizeText } from './normalizeText';

/**
 * Splits "Water, Sugar, Natural Flavors (contains citric acid)." into
 * ["water", "sugar", "natural flavors", "contains citric acid"].
 * Parenthetical sub-ingredient lists are flattened into the sequence
 * at the position where they appear.
 */
export function splitIngredients(raw: string): string[] {
  if (!raw) return [];

  // Flatten parentheses into top-level commas: "Milk (Cultured, Enzymes)"
  // -> "Milk, Cultured, Enzymes"
  const flattened = raw
    .replace(/[()]/g, ',')
    .replace(/\.$/, '');

  return flattened
    .split(/[,;]/)
    .map((part) => normalizeText(part))
    .filter((part) => part.length > 0);
}

export interface NormalizedIngredients {
  raw: string;
  list: string[]; // normalized, ordered, deduplicated-in-place preserved order
}

export function normalizeIngredients(raw: string): NormalizedIngredients {
  const list = splitIngredients(raw || '');
  return { raw: raw || '', list };
}
