// app/api/benchmark/route.ts
//
// Serves the real, offline-computed ml/results/benchmark.json (+
// training_run.json + dataset stats) to the /eval dashboard. Nothing here
// is computed at request time or invented — this route only reads files
// produced by ml/evaluate.py, ml/train.py, and data/scripts/dataset_stats.py.
// If those files don't exist yet (pipeline hasn't been run in this
// checkout), it returns `available: false` rather than fabricating numbers.

import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

// Always read the latest files from disk instead of baking a single
// build-time snapshot into a static response.
export const dynamic = 'force-dynamic';

async function readJsonIfExists(filePath: string): Promise<any | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Real-computed (not invented) summary of the independent gold set, straight from its own file. */
async function readIndependentDatasetInfo(filePath: string): Promise<{ size: number; categoryCounts: Record<string, number> } | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const lines = raw.split('\n').filter((l) => l.trim().length > 0);
    const categoryCounts: Record<string, number> = {};
    for (const line of lines) {
      const record = JSON.parse(line);
      const category = record.category || 'other';
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    }
    return { size: lines.length, categoryCounts };
  } catch {
    return null;
  }
}

export async function GET() {
  const root = process.cwd();
  const [benchmark, trainingRun, datasetStats, independentBenchmark, independentDatasetInfo] = await Promise.all([
    readJsonIfExists(path.join(root, 'ml', 'results', 'benchmark.json')),
    readJsonIfExists(path.join(root, 'ml', 'results', 'training_run.json')),
    readJsonIfExists(path.join(root, 'data', 'processed', 'dataset_stats.json')),
    // The original 59-case gold set's labels were mostly produced by running
    // the same rule engine being scored (see data/README.md's "silver
    // labeling" section) — a real 100-200 product independent benchmark,
    // labeled by direct human/manual reasoning rather than by executing
    // SugarShield's own detection code, lives separately here so the two
    // are never conflated on the eval page.
    readJsonIfExists(path.join(root, 'ml', 'results_independent', 'benchmark.json')),
    readIndependentDatasetInfo(path.join(root, 'data', 'independent_gold', 'independent_gold.jsonl')),
  ]);

  return NextResponse.json({
    available: Boolean(benchmark),
    benchmark,
    trainingRun,
    datasetStats,
    independentBenchmark: {
      available: Boolean(independentBenchmark),
      benchmark: independentBenchmark,
      datasetInfo: independentDatasetInfo,
    },
  });
}
