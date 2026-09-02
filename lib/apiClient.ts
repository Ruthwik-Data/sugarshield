// lib/apiClient.ts
//
// Thin client for the canonical POST /api/analyze endpoint. This is the
// single code path the web app uses to get a SugarShield result — the
// Chrome extension calls the same HTTP contract independently.

import { EvalMode } from './riskEngine';

export interface SugarShieldNutrition {
  servingSize?: string | null;
  totalSugarsG?: number | null;
  addedSugarsG?: number | null;
}

export interface SugarShieldResult {
  riskLevel: 'SAFE' | 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH';
  score: number;
  containsAddedSugar: boolean;
  containsHiddenSugar: boolean;
  containsArtificialSweetener: boolean;
  containsNaturalSugar: boolean;
  detectedSugars: string[];
  artificialSweeteners: string[];
  confidence: number;
  explanation: string;
  model: string;
  latencyMs: number;
  mode: EvalMode;
  // Present when the result came from the OCR (vision-parse) flow.
  productName?: string;
  ingredientsText?: string;
}

const MODE_STORAGE_KEY = 'sugarshield_eval_mode';

export function getStoredMode(): EvalMode {
  if (typeof window === 'undefined') return 'STRICT';
  const stored = window.localStorage.getItem(MODE_STORAGE_KEY);
  return stored === 'LENIENT' ? 'LENIENT' : 'STRICT';
}

export function setStoredMode(mode: EvalMode): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(MODE_STORAGE_KEY, mode);
}

export async function analyzeIngredients(
  ingredients: string,
  opts: { productName?: string; nutrition?: SugarShieldNutrition; mode?: EvalMode } = {}
): Promise<SugarShieldResult> {
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      productName: opts.productName,
      ingredients,
      nutrition: opts.nutrition,
      mode: opts.mode ?? getStoredMode(),
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.error || 'SugarShield analysis failed.');
  }

  return data as SugarShieldResult;
}
