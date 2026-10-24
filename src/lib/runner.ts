import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Asset } from './schema';
import { buildPlan } from './plan';
import { toPromptfooYaml } from './generate';
import { ingestPromptfooOutput, type RunRecord } from './ingest';
import { runFolder, saveRun } from './runs';

/**
 * Runs Promptfoo for one asset: writes the config, asks Promptfoo to generate the
 * attacks, evaluates them against the target and ingests the results.
 * Every file Promptfoo produces stays in the run folder for later review.
 */

function promptfoo(args: string[], env: NodeJS.ProcessEnv, cwd: string): Promise<number> {
  return new Promise((resolve, reject) => {
    // On Windows npx is a .cmd script and needs a shell, so quote paths with spaces.
    const win = process.platform === 'win32';
    const argv = win ? args.map((a) => (/\s/.test(a) ? `"${a}"` : a)) : args;
    const child = spawn('npx', ['--no-install', 'promptfoo', ...argv], { cwd, env, stdio: 'inherit', shell: win });
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });
}

export interface RunOptions {
  root?: string;
  /** Only print what would run. */
  dryRun?: boolean;
  /** Extra args for `promptfoo eval`, e.g. ["--max-concurrency", "2"]. */
  evalArgs?: string[];
}

export async function runAsset(asset: Asset, opts: RunOptions = {}): Promise<RunRecord | null> {
  const root = opts.root ?? process.cwd();
  const plan = buildPlan(asset);
  if (plan.plugins.length === 0) throw new Error(`Nothing to run for ${asset.id}: no Promptfoo plugin applies`);
  if (!asset.target) throw new Error(`${asset.id} has no target; add one to its inventory file`);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const folder = runFolder(asset.id, stamp, root);
  fs.mkdirSync(folder, { recursive: true });
  const configPath = path.join(folder, 'promptfooconfig.yaml');
  const testsPath = path.join(folder, 'redteam.yaml');
  const resultsPath = path.join(folder, 'results.json');
  fs.writeFileSync(configPath, toPromptfooYaml(plan));

  const env = { ...process.env };
  if (!asset.testing.remoteGeneration) env.PROMPTFOO_DISABLE_REMOTE_GENERATION = 'true';

  console.log(`\nPertinax · ${asset.name}`);
  console.log(`  ${plan.plugins.length} plugins, ${plan.strategies.length} strategies, ${plan.numTests} tests per plugin`);
  console.log(`  Run folder: ${path.relative(root, folder)}\n`);
  if (opts.dryRun) return null;

  const gen = await promptfoo(['redteam', 'generate', '-c', configPath, '-o', testsPath, '--force'], env, root);
  if (gen !== 0 || !fs.existsSync(testsPath)) throw new Error(`promptfoo redteam generate failed (exit ${gen})`);

  // `promptfoo eval` exits with 100 when some tests fail. For a red team that is the
  // expected outcome, not an error.
  const code = await promptfoo(['eval', '-c', testsPath, '-o', resultsPath, '--no-cache', ...(opts.evalArgs ?? [])], env, root);
  if (!fs.existsSync(resultsPath)) throw new Error(`promptfoo eval produced no results (exit ${code})`);

  const record = ingestPromptfooOutput(JSON.parse(fs.readFileSync(resultsPath, 'utf8')), { assetId: asset.id });
  record.id = stamp;
  saveRun(record, folder);
  return record;
}
