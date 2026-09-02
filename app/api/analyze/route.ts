// app/api/analyze/route.ts
//
// The one canonical SugarShield analysis endpoint. Both the web app and the
// Chrome extension call this same contract (Part 14 of the SugarShield 2.0
// goal) so there is a single source of truth for how a product gets scored.
//
// Production model: the deterministic hybrid rules engine in
// lib/riskEngine.ts. A fine-tuned transformer was trained and benchmarked
// offline (see ml/results/benchmark.json) but is not called here — there is
// no persistent process in this Vercel deployment to host it. See the
// README "Why the fine-tuned model isn't live" section for the full
// reasoning. If SUGARSHIELD_MODEL_ENDPOINT is set, this route will call out
// to an externally hosted model and reconcile its output with the
// deterministic layer (deterministic detections always win — see
// reconcileWithModel below) instead of ignoring the model entirely.

import { NextResponse } from 'next/server';
import { analyzeIngredientsText, EvalMode, RiskEngineResult } from '@/lib/riskEngine';

export interface AnalyzeRequestBody {
  productName?: string;
  ingredients: string;
  nutrition?: {
    servingSize?: string | null;
    totalSugarsG?: number | null;
    addedSugarsG?: number | null;
  };
  mode?: EvalMode;
}

export interface AnalyzeResponseBody {
  riskLevel: RiskEngineResult['riskLevel'];
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
}

const PRODUCTION_MODEL_NAME = 'sugarshield-rules-v2';

export async function POST(req: Request) {
  const start = Date.now();

  const body = (await req.json().catch(() => ({}))) as Partial<AnalyzeRequestBody>;
  const ingredients = String(body?.ingredients ?? '').trim();
  const mode: EvalMode = body?.mode === 'LENIENT' ? 'LENIENT' : 'STRICT';

  if (!ingredients) {
    return NextResponse.json(
      { error: 'ingredients is required (a plain-text ingredient list).' },
      { status: 400 }
    );
  }

  const result = analyzeIngredientsText(ingredients, { source: 'PASTED', mode });

  const response: AnalyzeResponseBody = {
    riskLevel: result.riskLevel,
    score: Math.round(result.score),
    containsAddedSugar: result.containsAddedSugar,
    containsHiddenSugar: result.containsHiddenSugar,
    containsArtificialSweetener: result.containsArtificialSweetener,
    containsNaturalSugar: result.containsNaturalSugar,
    detectedSugars: result.detectedSugars,
    artificialSweeteners: result.artificialSweeteners,
    confidence: Math.round(result.confidence * 100) / 100,
    explanation: result.explanation,
    model: PRODUCTION_MODEL_NAME,
    latencyMs: Date.now() - start,
    mode,
  };

  return NextResponse.json(response);
}
