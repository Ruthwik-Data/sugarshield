import { describe, it, expect } from 'vitest';
import { GET } from '@/app/api/benchmark/route';

describe('GET /api/benchmark', () => {
  it('serves the original benchmark and a real (not invented) independent benchmark section', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();

    // Original benchmark: real file on disk in this checkout (ml/results/benchmark.json).
    expect(body.available).toBe(true);
    expect(body.benchmark.systems).toHaveProperty('rule_baseline');
    expect(body.benchmark.systems).toHaveProperty('finetuned_model');
    expect(body.benchmark.systems).toHaveProperty('hybrid');

    // Independent benchmark: must never be conflated with the original —
    // its own section, computed from data/independent_gold/independent_gold.jsonl
    // and ml/results_independent/benchmark.json, both real files in this checkout.
    expect(body.independentBenchmark.available).toBe(true);
    expect(body.independentBenchmark.datasetInfo.size).toBeGreaterThanOrEqual(100);
    expect(body.independentBenchmark.datasetInfo.size).toBeLessThanOrEqual(200);
    expect(typeof body.independentBenchmark.datasetInfo.categoryCounts).toBe('object');
    expect(body.independentBenchmark.benchmark.systems).toHaveProperty('rule_baseline');

    // The two sections must not be the same measurement — they're different
    // gold sets by construction (that's the entire point of this route).
    expect(body.independentBenchmark.benchmark.gold_set_size).not.toBe(body.benchmark.gold_set_size);
  });
});
