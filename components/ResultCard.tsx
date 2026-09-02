'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { SugarShieldResult } from '@/lib/apiClient';

type RiskLevel = 'SAFE' | 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH';

const RISK_CONFIG: Record<
  RiskLevel,
  { label: string; ring: string; text: string; bg: string; border: string; bar: string }
> = {
  SAFE: { label: 'Safe', ring: 'ring-emerald-200', text: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', bar: 'bg-emerald-500' },
  LOW: { label: 'Low Risk', ring: 'ring-teal-200', text: 'text-teal-600', bg: 'bg-teal-50', border: 'border-teal-200', bar: 'bg-teal-500' },
  MODERATE: { label: 'Moderate Risk', ring: 'ring-amber-200', text: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', bar: 'bg-amber-500' },
  HIGH: { label: 'High Sugar Risk', ring: 'ring-orange-200', text: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200', bar: 'bg-orange-500' },
  VERY_HIGH: { label: 'Very High Sugar Risk', ring: 'ring-red-200', text: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', bar: 'bg-red-500' },
};

function normalizeRiskLevel(result: SugarShieldResult | any): RiskLevel {
  const raw = String(result?.riskLevel ?? '').toUpperCase();
  if (raw in RISK_CONFIG) return raw as RiskLevel;
  // Legacy PASS/WARN/FAIL fallback, in case an older result shape reaches this component.
  const legacy = String(result?.classification ?? result?.verdict ?? '').toUpperCase();
  if (legacy === 'PASS') return 'SAFE';
  if (legacy === 'FAIL') return 'HIGH';
  return 'MODERATE';
}

/** Splits raw ingredient text and wraps any detected sugar/sweetener term in a highlight span. */
function HighlightedIngredients({
  text,
  detectedSugars,
  artificialSweeteners,
}: {
  text: string;
  detectedSugars: string[];
  artificialSweeteners: string[];
}) {
  const parts = text.split(/([,;])/);
  const sugarSet = new Set(detectedSugars.map((t) => t.toLowerCase()));
  const sweetenerSet = new Set(artificialSweeteners.map((t) => t.toLowerCase()));

  return (
    <p className="text-sm leading-relaxed text-zinc-600">
      {parts.map((part, i) => {
        const lower = part.trim().toLowerCase();
        const isSugar = [...sugarSet].some((t) => lower.includes(t));
        const isSweetener = !isSugar && [...sweetenerSet].some((t) => lower.includes(t));
        if (isSugar) {
          return (
            <span key={i} className="font-semibold text-red-600 bg-red-50 px-1 rounded">
              {part}
            </span>
          );
        }
        if (isSweetener) {
          return (
            <span key={i} className="font-semibold text-purple-600 bg-purple-50 px-1 rounded">
              {part}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </p>
  );
}

function FlagRow({ label, value, invert }: { label: string; value: boolean; invert?: boolean }) {
  const good = invert ? value : !value;
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-zinc-500">{label}</span>
      <span className={`font-semibold ${good ? 'text-zinc-400' : 'text-red-600'}`}>
        {value ? 'Yes' : 'No'}
      </span>
    </div>
  );
}

export default function ResultCard({ result }: { result: (SugarShieldResult & { ingredientsText?: string }) | any }) {
  const riskLevel = normalizeRiskLevel(result);
  const config = RISK_CONFIG[riskLevel];
  const score = typeof result?.score === 'number' ? Math.round(result.score) : null;
  const confidencePct = Math.round((Number(result?.confidence) || 0) * 100);
  const detectedSugars: string[] = Array.isArray(result?.detectedSugars) ? result.detectedSugars : [];
  const artificialSweeteners: string[] = Array.isArray(result?.artificialSweeteners) ? result.artificialSweeteners : [];
  const explanation: string = result?.explanation || result?.notes || 'No further explanation available.';
  const ingredientsText: string | undefined = result?.ingredientsText || result?.extracted?.ingredientsText;

  const [feedback, setFeedback] = useState<'yes' | 'unsure' | 'no' | null>(null);

  useEffect(() => {
    setFeedback(null);
  }, [result]);

  const handleFeedback = (val: 'yes' | 'unsure' | 'no') => {
    setFeedback(val);
    const key = `sugarshield_feedback_${Date.now()}`;
    try {
      localStorage.setItem(
        key,
        JSON.stringify({ val, riskLevel, detectedSugars, timestamp: new Date().toISOString() })
      );
    } catch {}
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className="bg-white rounded-2xl p-5 shadow-sm border border-zinc-100 space-y-5"
    >
      {/* SugarShield Score */}
      <div className="flex items-center gap-4">
        <div className={`w-20 h-20 rounded-full ${config.bg} ${config.border} border-2 flex flex-col items-center justify-center shrink-0`}>
          {score !== null ? (
            <>
              <span className={`text-2xl font-bold leading-none ${config.text}`}>{score}</span>
              <span className="text-[9px] text-zinc-400 font-medium mt-0.5">/ 100</span>
            </>
          ) : (
            <span className="text-lg">—</span>
          )}
        </div>
        <div>
          <p className="text-xs text-zinc-400 uppercase tracking-wider font-semibold mb-0.5">SugarShield Score</p>
          <p className={`text-xl font-bold ${config.text}`}>{config.label}</p>
        </div>
      </div>

      {/* Detected sugars */}
      {(detectedSugars.length > 0 || artificialSweeteners.length > 0) && (
        <div className="space-y-2">
          {detectedSugars.length > 0 && (
            <div>
              <p className="text-xs text-zinc-400 uppercase tracking-wider font-semibold mb-1.5">Detected Sugars</p>
              <div className="flex flex-wrap gap-1.5">
                {detectedSugars.map((term, i) => (
                  <span key={i} className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-red-50 text-red-700 border border-red-100 capitalize">
                    {term}
                  </span>
                ))}
              </div>
            </div>
          )}
          {artificialSweeteners.length > 0 && (
            <div>
              <p className="text-xs text-zinc-400 uppercase tracking-wider font-semibold mb-1.5">Artificial / Non-Nutritive Sweeteners</p>
              <div className="flex flex-wrap gap-1.5">
                {artificialSweeteners.map((term, i) => (
                  <span key={i} className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-purple-50 text-purple-700 border border-purple-100 capitalize">
                    {term}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Highlighted ingredients */}
      {ingredientsText && (
        <div>
          <p className="text-xs text-zinc-400 uppercase tracking-wider font-semibold mb-1.5">Ingredients</p>
          <HighlightedIngredients text={ingredientsText} detectedSugars={detectedSugars} artificialSweeteners={artificialSweeteners} />
        </div>
      )}

      {/* Flags */}
      <div className="bg-zinc-50 rounded-xl px-3 divide-y divide-zinc-100">
        <FlagRow label="Added sugar detected" value={!!result?.containsAddedSugar} />
        <FlagRow label="Hidden sugar detected" value={!!result?.containsHiddenSugar} />
        <FlagRow label="Artificial sweetener" value={!!result?.containsArtificialSweetener} />
        <FlagRow label="Natural sugar only" value={!!result?.containsNaturalSugar} invert />
      </div>

      {/* Why flagged */}
      <div>
        <p className="text-xs text-zinc-400 uppercase tracking-wider font-semibold mb-1.5">Why SugarShield Flagged This</p>
        <p className="text-sm text-zinc-600 leading-relaxed">{explanation}</p>
      </div>

      {/* Confidence */}
      <p className="text-sm text-zinc-500">
        Model confidence: <span className="font-medium text-zinc-700">{confidencePct}%</span>
        {result?.mode && <span className="text-zinc-400"> · {result.mode === 'STRICT' ? 'Strict mode' : 'Lenient mode'}</span>}
      </p>

      {/* Footer */}
      <div className="pt-3 border-t border-zinc-100 space-y-3">
        <div className="bg-zinc-50 rounded-xl p-3 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="text-xs font-medium text-zinc-500">Does this result look right?</span>
          {feedback ? (
            <span className="text-xs text-emerald-600 font-medium">Thanks for your feedback!</span>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => handleFeedback('yes')} className="px-3 py-1 bg-white border border-zinc-200 rounded-lg text-xs hover:bg-emerald-50 hover:text-emerald-700 transition">Yes</button>
              <button onClick={() => handleFeedback('unsure')} className="px-3 py-1 bg-white border border-zinc-200 rounded-lg text-xs hover:bg-amber-50 hover:text-amber-700 transition">Not sure</button>
              <button onClick={() => handleFeedback('no')} className="px-3 py-1 bg-white border border-zinc-200 rounded-lg text-xs hover:bg-red-50 hover:text-red-700 transition">Incorrect</button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
