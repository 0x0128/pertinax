#!/usr/bin/env node
/**
 * Pertinax CLI. Run with `npm run pertinax -- <command>`.
 */
import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { loadInventory } from '../lib/inventory';
import { buildPlan } from '../lib/plan';
import { toPromptfooYaml } from '../lib/generate';
import { ingestPromptfooOutput } from '../lib/ingest';
import { loadRuns, saveRun, runFolder } from '../lib/runs';
import { inventoryCoverage, STATUS_LABEL } from '../lib/coverage';
import { runAsset } from '../lib/runner';
import { loadCatalog } from '../lib/catalog';
import type { Asset } from '../lib/schema';

const program = new Command();
program.name('pertinax').description('AI asset inventory and red-team coverage for Promptfoo').version('0.1.0');

function assetsOrExit(ids: string[], all = false): Asset[] {
  const { assets, issues } = loadInventory();
  if (issues.length) {
    issues.forEach((i) => console.error(`  ${i.file}: ${i.message}`));
    console.error('\nFix the inventory first (npm run validate).');
    process.exit(1);
  }
  if (all) return assets;
  const picked = ids.map((id) => assets.find((a) => a.id === id) ?? (console.error(`Unknown asset "${id}". Known: ${assets.map((a) => a.id).join(', ')}`), process.exit(1)));
  if (!picked.length) {
    console.error('Name at least one asset, or pass --all');
    process.exit(1);
  }
  return picked;
}

program
  .command('list')
  .description('List inventory assets and their coverage')
  .action(() => {
    const { assets } = loadInventory();
    const cov = inventoryCoverage(assets, loadRuns().runs);
    const rows = cov.assets.map((a) => {
      const applicable = a.cells.filter((c) => c.status !== 'na');
      return {
        asset: a.asset.id,
        kind: a.asset.kind,
        exposure: a.asset.exposure,
        risks: applicable.length,
        breaches: applicable.filter((c) => c.status === 'breach').length,
        untested: applicable.filter((c) => c.status === 'untested').length,
        'last run': a.latestRun ? a.latestRun.startedAt.slice(0, 10) + (a.latestRun.sample ? ' (sample)' : '') : 'never',
      };
    });
    console.table(rows);
  });

program
  .command('validate')
  .description('Check inventory files and catalog consistency')
  .action(() => {
    const { assets, issues } = loadInventory();
    const catalog = loadCatalog();
    const techniqueIds = new Set(catalog.atlas.techniques.map((t) => t.id));
    const mapped = [...Object.values(catalog.techniqueMap.plugins), ...Object.values(catalog.techniqueMap.strategies)].flat();
    for (const id of mapped) if (!techniqueIds.has(id)) issues.push({ file: 'catalog/technique-map.yaml', message: `Unknown ATLAS technique ${id}` });
    for (const a of assets) {
      for (const key of Object.keys(a.risks)) {
        if (!catalog.risks.some((r) => r.id === key)) issues.push({ file: a.id, message: `risks.${key} is not an OWASP LLM or Agentic risk id` });
      }
      if (!a.target) issues.push({ file: a.id, message: 'warning: no target, so it can be planned but not run' });
    }
    const errors = issues.filter((i) => !i.message.startsWith('warning'));
    issues.forEach((i) => console.log(`${i.message.startsWith('warning') ? '!' : '✗'} ${i.file}: ${i.message}`));
    console.log(`\n${assets.length} assets, ATLAS ${catalog.atlas.version}, Promptfoo mappings from ${catalog.promptfoo.promptfooVersion}`);
    if (errors.length) process.exit(1);
    console.log('Inventory is valid.');
  });

program
  .command('plan')
  .argument('<asset>', 'asset id')
  .description('Show which risks apply to an asset and which Promptfoo tests cover them')
  .action((id: string) => {
    const [asset] = assetsOrExit([id]);
    const plan = buildPlan(asset);
    console.log(`\n${asset.name} (${asset.kind}, ${asset.exposure})\n`);
    for (const a of plan.applicability) {
      const mark = a.applies ? '●' : '○';
      console.log(`${mark} ${a.risk.id.padEnd(6)} ${a.risk.name}\n    ${a.reason}${a.decision ? `\n    decision: ${a.decision.status} (${a.decision.reason})` : ''}`);
    }
    console.log(`\nPlugins (${plan.plugins.length}):`);
    plan.plugins.forEach((p) => console.log(`  + ${p.id.padEnd(32)} ${p.risks.join(', ')}`));
    if (plan.skipped.length) {
      console.log(`\nLeft out (${plan.skipped.length}):`);
      plan.skipped.forEach((s) => console.log(`  - ${s.id.padEnd(32)} ${s.reason}`));
    }
    if (plan.manualRisks.length) console.log(`\nNo automated test, review by hand: ${plan.manualRisks.join(', ')}`);
    console.log(`\nStrategies: ${plan.strategies.join(', ')} · ${plan.numTests} tests per plugin\n`);
  });

program
  .command('generate')
  .argument('[assets...]', 'asset ids')
  .option('--all', 'every asset in the inventory')
  .option('-o, --out <dir>', 'output folder', 'generated')
  .description('Write a promptfooconfig.yaml per asset')
  .action((ids: string[], opts: { all?: boolean; out: string }) => {
    fs.mkdirSync(opts.out, { recursive: true });
    for (const asset of assetsOrExit(ids, opts.all)) {
      const file = path.join(opts.out, `${asset.id}.promptfooconfig.yaml`);
      fs.writeFileSync(file, toPromptfooYaml(buildPlan(asset)));
      console.log(`Wrote ${file}`);
    }
  });

program
  .command('run')
  .argument('[assets...]', 'asset ids')
  .option('--all', 'every asset that has a target')
  .option('--dry-run', 'write the config and stop before calling Promptfoo')
  .option('-j, --max-concurrency <n>', 'passed to promptfoo eval')
  .description('Generate attacks with Promptfoo, run them and record the results')
  .action(async (ids: string[], opts: { all?: boolean; dryRun?: boolean; maxConcurrency?: string }) => {
    const assets = assetsOrExit(ids, opts.all).filter((a) => a.target || (console.warn(`Skipping ${a.id}: no target`), false));
    for (const asset of assets) {
      try {
        const rec = await runAsset(asset, {
          dryRun: opts.dryRun,
          evalArgs: opts.maxConcurrency ? ['--max-concurrency', opts.maxConcurrency] : [],
        });
        if (rec) console.log(`\n${asset.id}: ${rec.stats.total} attacks, ${rec.stats.failed} got through, ${rec.stats.errors} errors`);
      } catch (err) {
        console.error(`\n${asset.id}: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    }
  });

program
  .command('ingest')
  .argument('<results>', 'JSON written by `promptfoo eval -o results.json`')
  .option('-a, --asset <id>', 'asset the results belong to (default: read from the config metadata)')
  .description('Import results from a Promptfoo run made outside Pertinax (CI, another machine)')
  .action((file: string, opts: { asset?: string }) => {
    const rec = ingestPromptfooOutput(JSON.parse(fs.readFileSync(file, 'utf8')), { assetId: opts.asset });
    const known = loadInventory().assets.some((a) => a.id === rec.assetId);
    if (!known) console.warn(`Warning: "${rec.assetId}" is not in the inventory; the run will not show up until it is.`);
    const out = saveRun(rec, runFolder(rec.assetId, rec.id));
    fs.copyFileSync(file, path.join(path.dirname(out), 'results.json'));
    console.log(`Imported ${rec.stats.total} results (${rec.findings.length} findings) into ${path.relative(process.cwd(), out)}`);
  });

program
  .command('report')
  .option('--fail-on <status>', 'exit 1 if any cell has this status: breach, untested or stale')
  .option('--json', 'machine-readable output')
  .description('Coverage summary for the terminal or CI')
  .action((opts: { failOn?: string; json?: boolean }) => {
    const { assets } = loadInventory();
    const { runs, usingSamples } = loadRuns();
    const cov = inventoryCoverage(assets, runs);
    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            totals: cov.totals,
            assets: cov.assets.map((a) => ({
              id: a.asset.id,
              stale: a.stale,
              cells: Object.fromEntries(a.cells.map((c) => [c.risk.id, c.status])),
            })),
          },
          null,
          2,
        ),
      );
    } else {
      if (usingSamples) console.log('(No runs in runs/ yet: showing the sample data in examples/runs)\n');
      const t = cov.totals;
      console.log(`Assets ${t.assets} · applicable risks ${t.applicable} · with evidence ${t.withEvidence} · breaches ${t.breaches} · not tested ${t.untested} · manual review ${t.review}`);
      for (const a of cov.assets) {
        const bad = a.cells.filter((c) => ['breach', 'untested', 'review'].includes(c.status));
        console.log(`\n${a.asset.id}${a.stale ? '  (stale)' : ''}`);
        bad.forEach((c) => console.log(`  ${c.risk.id.padEnd(6)} ${STATUS_LABEL[c.status].padEnd(20)} ${c.note}`));
        if (!bad.length) console.log('  no gaps');
      }
    }
    const f = opts.failOn;
    if (f === 'stale' && cov.assets.some((a) => a.stale)) process.exitCode = 1;
    if (f && f !== 'stale' && cov.assets.some((a) => a.cells.some((c) => c.status === f))) process.exitCode = 1;
  });

program.parseAsync().catch((err) => {
  console.error((err as Error).message);
  process.exit(1);
});

