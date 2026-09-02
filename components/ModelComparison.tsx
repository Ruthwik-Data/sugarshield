'use client';

import { useEffect, useState } from 'react';

interface SystemMetrics {
  n_gold: number;
  n_scored_valid_json: number;
  n_invalid_json: number;
  json_validity_rate: number | null;
  accuracy: number | null;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  false_positives: number;
  false_negatives: number;
  risk_level_exact_match_accuracy: number | null;
  hidden_sugar_recall: number | null;
  trigger_match_accuracy: number | null;
  avg_latency_ms: number | null;
}

interface BenchmarkResponse {
  available: boolean;
  benchmark: {
    generated_at_utc: string;
    gold_set_size: number;
    systems: { rule_baseline: SystemMetrics; finetuned_model: SystemMetrics; hybrid: SystemMetrics };
  } | null;
  trainingRun: {
    base_model: string;
    fine_tuning_method: string;
    reason_not_lora_on_pretrained: string | null;
    parameters_total: number;
    train_examples: number;
    validation_examples: number;
    hardware: string;
    train_runtime_seconds: number;
  } | null;
  datasetStats: any;
}

const SYSTEM_LABELS: Record<string, string> = {
  rule_baseline: 'Rule Engine (production)',
  finetuned_model: 'Fine-tuned Model (standalone)',
  hybrid: 'Hybrid (model + rules)',
};

function pct(v: number | null): string {
  if (v === null || v === undefined) return '—';
  return `${Math.round(v * 100)}%`;
}

export default function ModelComparison() {
  const [data, setData] = useState<BenchmarkResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/benchmark')
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6 text-sm text-zinc-400">
        Loading model comparison…
      </div>
    );
  }

  if (!data?.available || !data.benchmark) {
    return (
      <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-6">
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">SugarShield 2.0 — Model Comparison</h2>
        <p className="text-sm text-zinc-500 leading-relaxed">
          Benchmark results have not been generated in this checkout yet. Run <code className="bg-white px-1 py-0.5 rounded border border-zinc-200">ml/evaluate.py</code> to
          produce <code className="bg-white px-1 py-0.5 rounded border border-zinc-200">ml/results/benchmark.json</code> — this page reads that file directly and never shows invented numbers.
        </p>
      </div>
    );
  }

  const { systems, gold_set_size } = data.benchmark;
  const rows: Array<{ key: keyof typeof systems; metric: string; get: (m: SystemMetrics) => string }> = [
    { key: 'rule_baseline', metric: '', get: () => '' },
  ];

  const metricRows: { label: string; get: (m: SystemMetrics) => string }[] = [
    { label: 'Accuracy (flag vs. no-flag)', get: (m) => pct(m.accuracy) },
    { label: 'Precision', get: (m) => pct(m.precision) },
    { label: 'Recall', get: (m) => pct(m.recall) },
    { label: 'F1', get: (m) => pct(m.f1) },
    { label: 'False negatives', get: (m) => String(m.false_negatives) },
    { label: 'False positives', get: (m) => String(m.false_positives) },
    { label: 'Hidden-sugar recall', get: (m) => pct(m.hidden_sugar_recall) },
    { label: 'Trigger match accuracy', get: (m) => pct(m.trigger_match_accuracy) },
    { label: 'Risk-level exact match', get: (m) => pct(m.risk_level_exact_match_accuracy) },
    { label: 'Structured JSON validity', get: (m) => pct(m.json_validity_rate) },
    { label: 'Avg latency', get: (m) => (m.avg_latency_ms !== null ? `${m.avg_latency_ms.toFixed(1)} ms` : '—') },
  ];

  const systemKeys: (keyof typeof systems)[] = ['rule_baseline', 'finetuned_model', 'hybrid'];

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6 space-y-4">
        <div>
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">SugarShield 2.0 — Model Comparison</h2>
          <p className="text-sm text-zinc-500 leading-relaxed">
            Measured on a frozen gold benchmark of <strong>{gold_set_size}</strong> hand-verified products (never used in training), comparing the
            deterministic rule engine actually running in production, a fine-tuned small model, and a hybrid of the two.
          </p>
        </div>

        {data.trainingRun && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-zinc-50 rounded-lg p-3">
              <p className="text-zinc-400 uppercase tracking-wider font-semibold mb-1">Base model</p>
              <p className="text-zinc-700 font-medium">{data.trainingRun.base_model}</p>
            </div>
            <div className="bg-zinc-50 rounded-lg p-3">
              <p className="text-zinc-400 uppercase tracking-wider font-semibold mb-1">Method</p>
              <p className="text-zinc-700 font-medium">{data.trainingRun.fine_tuning_method.replace(/_/g, ' ')}</p>
            </div>
            <div className="bg-zinc-50 rounded-lg p-3">
              <p className="text-zinc-400 uppercase tracking-wider font-semibold mb-1">Train / Val examples</p>
              <p className="text-zinc-700 font-medium">{data.trainingRun.train_examples} / {data.trainingRun.validation_examples}</p>
            </div>
            <div className="bg-zinc-50 rounded-lg p-3">
              <p className="text-zinc-400 uppercase tracking-wider font-semibold mb-1">Hardware</p>
              <p className="text-zinc-700 font-medium">{data.trainingRun.hardware}</p>
            </div>
          </div>
        )}

        {data.trainingRun?.reason_not_lora_on_pretrained && (
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
            <p className="text-xs text-amber-800 leading-relaxed">
              <strong>Why not LoRA on a pretrained model:</strong> {data.trainingRun.reason_not_lora_on_pretrained}
            </p>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[640px] text-sm">
            <thead>
              <tr className="bg-zinc-50 border-b border-zinc-100 text-[10px] uppercase tracking-wider text-zinc-400 font-semibold">
                <th className="p-3">Metric</th>
                {systemKeys.map((k) => (
                  <th key={k} className="p-3">{SYSTEM_LABELS[k]}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {metricRows.map((row) => (
                <tr key={row.label}>
                  <td className="p-3 text-zinc-500">{row.label}</td>
                  {systemKeys.map((k) => (
                    <td key={k} className="p-3 font-medium text-zinc-800">{row.get(systems[k])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-zinc-400 leading-relaxed pt-2 border-t border-zinc-100">
          Production (<code>/api/analyze</code>) runs the rule engine — see the README for why, and for the reasoning behind selecting it over the
          fine-tuned model based on these measured results.
        </p>
      </div>
    </div>
  );
}
