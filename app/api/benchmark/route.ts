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

export async function GET() {
  const root = process.cwd();
  const [benchmark, trainingRun, datasetStats] = await Promise.all([
    readJsonIfExists(path.join(root, 'ml', 'results', 'benchmark.json')),
    readJsonIfExists(path.join(root, 'ml', 'results', 'training_run.json')),
    readJsonIfExists(path.join(root, 'data', 'processed', 'dataset_stats.json')),
  ]);

  return NextResponse.json({
    available: Boolean(benchmark),
    benchmark,
    trainingRun,
    datasetStats,
  });
}
