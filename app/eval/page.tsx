'use client';

import Link from 'next/link';
import { useState, useMemo } from 'react';
import evalSet from '@/data/evalSet.json';
import { classifyProduct } from '@/lib/classifier';
import ModelComparison from '@/components/ModelComparison';

// Helper to map 0-1 confidence to High/Medium/Low
function getConfidenceLabel(score: number): 'High' | 'Medium' | 'Low' {
  if (score >= 0.9) return 'High';
  if (score >= 0.7) return 'Medium';
  return 'Low';
}

function getConfidenceReason(inputType: string): string {
  if (inputType.includes('URL')) return 'URL-based extraction';
  if (inputType === 'PASTED') return 'Full ingredient list';
  if (inputType === 'VISION') return 'OCR confidence';
  return 'Heuristic analysis';
}

function getVerdictLabel(verdict: string): string {
  if (verdict === 'PASS') return 'No Added Sugar Detected';
  if (verdict === 'FAIL') return 'High Sugar Risk';
  if (verdict === 'WARN') return 'Potential Sugar Risk';
  return verdict;
}

export default function EvalPage() {
  const [filter, setFilter] = useState<'ALL' | 'PASS' | 'WARN' | 'FAIL' | 'FALSE_NEG'>('ALL');

  // RUN EVALS LIVE
  const results = useMemo(() => {
    return evalSet.map((tc) => {
      const output = classifyProduct({
        productName: tc.inputs.productName,
        ingredientsText: tc.inputs.ingredientsText,
        source: 'EVAL'
      });

      // Logic: Verdict correct?
      const actualVerdict = output.classification || 'WARN'; // Default fallback
      const isCorrect = actualVerdict === tc.expectedVerdict;

      // Logic: False Negative? (Actual=PASS but Expected!=PASS)
      const isFalseNegative = actualVerdict === 'PASS' && tc.expectedVerdict !== 'PASS';

      // Logic: Trigger Match?
      const actualTriggers = (output.matchedTerms || []).map(m => m.term.toLowerCase());
      const expectedTriggers = (tc.expectedTriggers || []).map(t => t.toLowerCase());
      const triggerMatch = expectedTriggers.length === 0
        ? true
        : expectedTriggers.some(et => actualTriggers.includes(et));

      return {
        ...tc,
        actualVerdict,
        actualTriggers: (output.matchedTerms || []).map(m => m.term),
        confidenceScore: output.confidence,
        confidenceLabel: getConfidenceLabel(output.confidence),
        isCorrect,
        isFalseNegative,
        triggerMatch
      };
    });
  }, []);

  // CALCULATE METRICS
  // v1's classifier (lib/classifier.ts) never had a lenient mode — it is
  // frozen exactly as it shipped, kept only as a historical baseline. We no
  // longer show simulated/invented numbers for a "lenient v1"; the real
  // strict-vs-lenient comparison lives in the SugarShield 2.0 section below,
  // which is backed by lib/riskEngine.ts (which genuinely supports both).
  const metrics = useMemo(() => {
    const total = results.length;
    const correct = results.filter(r => r.isCorrect).length;
    const falseNegatives = results.filter(r => r.isFalseNegative).length;
    const triggerMatches = results.filter(r => r.triggerMatch).length;

    return {
      accuracy: Math.round((correct / total) * 100),
      falseNegatives,
      triggerMatchRate: Math.round((triggerMatches / total) * 100),
    };
  }, [results]);

  const filteredResults = results.filter(r => {
    if (filter === 'ALL') return true;
    if (filter === 'FALSE_NEG') return r.isFalseNegative;
    return r.actualVerdict === filter;
  });

  return (
    <div className="min-h-screen sugar-bg text-ink p-6 sm:p-12 pb-24">
      <div className="max-w-6xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 mb-1">Model Evaluation</h1>
            <p className="text-sm text-zinc-500 max-w-lg leading-relaxed">
              SugarShield is designed for safety-first decisions. Missing hidden sugar is riskier than over-warning.
            </p>
          </div>
          <Link href="/" className="px-4 py-2 bg-white border border-zinc-200 rounded-xl shadow-sm hover:shadow-md transition text-sm font-medium text-zinc-700 shrink-0">
            ← Back
          </Link>
        </div>

        {/* Safety Summary */}
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">Safety Summary</h2>
          <p className="text-xs text-zinc-400 mb-5">SugarShield v1 — legacy rule engine, frozen exactly as it originally shipped, kept as a historical baseline.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="flex flex-col gap-1">
              <span className={`text-3xl font-semibold ${metrics.falseNegatives === 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {metrics.falseNegatives}
              </span>
              <span className="text-sm font-medium text-zinc-700">False Negatives</span>
              <span className="text-xs text-zinc-400">Missed sugar detections</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-3xl font-semibold text-zinc-800">Intentional</span>
              <span className="text-sm font-medium text-zinc-700">Conservative Bias</span>
              <span className="text-xs text-zinc-400">Warn more, miss less</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-3xl font-semibold text-zinc-800">Safety</span>
              <span className="text-sm font-medium text-zinc-700">Goal</span>
              <span className="text-xs text-zinc-400">Maximize safety over precision</span>
            </div>
          </div>
        </div>

        <ModelComparison />

        {/* Why This Matters */}
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6 space-y-4">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Why This Matters</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-zinc-50 rounded-xl p-4 space-y-1.5">
              <p className="text-sm font-semibold text-zinc-800">Sugar hides in plain sight</p>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Food labels often use dozens of alternative names — maltodextrin, dextrose, cane juice, rice syrup, corn syrup solids, and more.
              </p>
            </div>
            <div className="bg-zinc-50 rounded-xl p-4 space-y-1.5">
              <p className="text-sm font-semibold text-zinc-800">Keyword-only systems miss cases</p>
              <p className="text-xs text-zinc-500 leading-relaxed">
                A basic system looking for &quot;sugar&quot; would miss &quot;corn syrup solids.&quot; SugarShield is specifically designed to catch these hidden forms.
              </p>
            </div>
            <div className="bg-zinc-50 rounded-xl p-4 space-y-1.5">
              <p className="text-sm font-semibold text-zinc-800">Missing it is worse</p>
              <p className="text-xs text-zinc-500 leading-relaxed">
                A false negative tells someone a product is safe when it isn&apos;t. A false positive just prompts a double-check. We optimize accordingly.
              </p>
            </div>
          </div>
        </div>

        {/* Product Decision */}
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5">
          <h2 className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2">Our product decision</h2>
          <p className="text-sm text-zinc-700 leading-relaxed">
            We intentionally over-warn rather than miss hidden sugar, because false negatives are riskier for our users than a false alarm.
          </p>
        </div>

        {/* Trigger Match Rate */}
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-zinc-700">Trigger Match Rate</p>
            <p className="text-xs text-zinc-400">How often the model identifies the correct sugar ingredient</p>
          </div>
          <span className="text-2xl font-semibold text-zinc-800">{metrics.triggerMatchRate}%</span>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(['ALL', 'PASS', 'WARN', 'FAIL', 'FALSE_NEG'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap ${filter === f
                ? 'bg-zinc-900 text-white shadow-sm'
                : 'bg-white text-zinc-500 border border-zinc-200 hover:bg-zinc-50'
                }`}
            >
              {f === 'FALSE_NEG' ? 'False Negatives' : f}
            </button>
          ))}
        </div>

        {/* Results Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-zinc-50 border-b border-zinc-100 text-[10px] uppercase tracking-wider text-zinc-400 font-semibold">
                  <th className="p-4 w-48">Example</th>
                  <th className="p-4 w-32">Input Type</th>
                  <th className="p-4 w-32">Expected</th>
                  <th className="p-4 w-32">Actual</th>
                  <th className="p-4 w-36">Confidence</th>
                  <th className="p-4 w-48">Trigger(s)</th>
                  <th className="p-4">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {filteredResults.map((r) => (
                  <tr key={r.id} className="group hover:bg-zinc-50/60 transition-colors text-sm">
                    <td className="p-4">
                      <div className="font-medium text-zinc-800">{r.name}</div>
                      <div className="text-xs text-zinc-400 truncate max-w-[180px]">{r.inputs.productName}</div>
                    </td>
                    <td className="p-4 text-xs text-zinc-500">
                      {r.inputType}
                    </td>
                    <td className="p-4">
                      <VerdictBadge verdict={r.expectedVerdict} />
                    </td>
                    <td className="p-4">
                      <VerdictBadge verdict={r.actualVerdict} />
                      {!r.isCorrect && (
                        <span className="ml-2 inline-block w-2 h-2 rounded-full bg-red-400" title="Mismatch" />
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col gap-0.5">
                        <span className={`text-xs font-medium w-fit px-2 py-0.5 rounded ${r.confidenceLabel === 'High' ? 'bg-emerald-100 text-emerald-800' :
                          r.confidenceLabel === 'Medium' ? 'bg-amber-100 text-amber-800' :
                            'bg-zinc-100 text-zinc-600'
                          }`}>
                          {r.confidenceLabel}
                        </span>
                        <span className="text-[10px] text-zinc-400">
                          {getConfidenceReason(r.inputType)}
                        </span>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-1">
                        {r.actualTriggers.slice(0, 3).map(t => (
                          <span key={t} className="inline-block px-1.5 py-0.5 bg-zinc-100 border border-zinc-200 rounded text-[10px] text-zinc-600 font-medium">
                            {t}
                          </span>
                        ))}
                        {r.actualTriggers.length === 0 && <span className="text-zinc-300">-</span>}
                      </div>
                    </td>
                    <td className="p-4 text-xs text-zinc-500 max-w-xs leading-relaxed">
                      {r.notes}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 bg-zinc-50 border-t border-zinc-100">
            <p className="text-xs text-zinc-400 text-center">
              Live evaluation data, computed in your browser from the original 15-case eval set.
            </p>
          </div>
        </div>

        {/* PM Insight */}
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">PM Insight</p>
          <p className="text-sm text-zinc-600 leading-relaxed italic">
            &quot;Several WARN results (e.g., Diet Soda, Coconut Water) are intentional. These products contain sweeteners or naturally occurring sugars that are debated in nutritional science. SugarShield defaults to caution rather than silent pass to preserve user trust.&quot;
          </p>
        </div>

        {/* Known Limitation */}
        <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-5">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Known limitation</h2>
          <p className="text-sm text-zinc-500 leading-relaxed">
            This system may over-flag some products. This is an intentional tradeoff to prioritize user safety.
          </p>
        </div>

      </div>
    </div>
  );
}

function VerdictBadge({ verdict }: { verdict: string }) {
  const styles =
    verdict === 'PASS' ? 'bg-emerald-100 text-emerald-800' :
      verdict === 'FAIL' ? 'bg-red-100 text-red-800' :
        'bg-amber-100 text-amber-800';

  const label = getVerdictLabel(verdict);

  return (
    <span className={`inline-flex items-center justify-center px-2 py-1 rounded text-[10px] font-semibold w-full max-w-[140px] text-center ${styles}`}>
      {label}
    </span>
  );
}
