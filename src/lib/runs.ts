import fs from 'node:fs';
import path from 'node:path';
import type { RunRecord } from './ingest';

/**
 * Runs live on disk as runs/<asset>/<run-id>/run.json next to the Promptfoo files that
 * produced them. When there are no real runs yet, the dashboard falls back to the
 * synthetic samples in examples/runs so the views are not empty on first launch.
 */

export function runsDir(root = process.cwd()) {
  return process.env.PERTINAX_RUNS_DIR ?? path.join(root, 'runs');
}

function readRunsFrom(dir: string, sample: boolean): RunRecord[] {
  if (!fs.existsSync(dir)) return [];
  const runs: RunRecord[] = [];
  for (const asset of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!asset.isDirectory()) continue;
    for (const run of fs.readdirSync(path.join(dir, asset.name), { withFileTypes: true })) {
      const file = path.join(dir, asset.name, run.name, 'run.json');
      if (!run.isDirectory() || !fs.existsSync(file)) continue;
      try {
        const rec = JSON.parse(fs.readFileSync(file, 'utf8')) as RunRecord;
        runs.push(sample ? { ...rec, sample: true } : rec);
      } catch {
        // A half-written run must not break the dashboard; `pertinax validate` reports it.
      }
    }
  }
  return runs.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

export interface RunSet {
  runs: RunRecord[];
  usingSamples: boolean;
}

export function loadRuns(root = process.cwd()): RunSet {
  const real = readRunsFrom(runsDir(root), false);
  const wantSamples = process.env.PERTINAX_SAMPLES;
  if (wantSamples === '0' || (real.length > 0 && wantSamples !== '1')) return { runs: real, usingSamples: false };
  const samples = readRunsFrom(path.join(root, 'examples', 'runs'), true);
  return { runs: wantSamples === '1' ? [...real, ...samples] : samples, usingSamples: samples.length > 0 };
}

export function runFolder(assetId: string, runId: string, root = process.cwd()) {
  return path.join(runsDir(root), assetId, runId.replace(/[^\w.-]+/g, '-'));
}

export function saveRun(rec: RunRecord, folder = runFolder(rec.assetId, rec.id)) {
  fs.mkdirSync(folder, { recursive: true });
  const file = path.join(folder, 'run.json');
  fs.writeFileSync(file, JSON.stringify(rec, null, 2) + '\n');
  return file;
}
