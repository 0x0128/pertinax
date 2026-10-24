import type { Asset } from './schema';
import type { Finding, RunRecord } from './ingest';
import { buildPlan, type TestPlan } from './plan';
import {
  loadCatalog,
  matchesPlugin,
  promptfooMappingFor,
  type Catalog,
  type Risk,
  type Severity,
} from './catalog';
import type { Applicability } from './applicability';

/**
 * Joins the inventory, the test plans and the run history into the answers the
 * dashboard shows: for every asset and risk, is there evidence, and what does it say?
 */

export type CellStatus =
  | 'breach' // latest test of this risk found a working attack
  | 'holding' // every planned test ran and none succeeded
  | 'partial' // some planned tests ran, none succeeded, others never ran
  | 'untested' // tests exist for this risk but have never run
  | 'review' // applies, but Promptfoo cannot test it here: needs manual work or config
  | 'covered' // covered by manual evidence or a recorded risk acceptance
  | 'na'; // does not apply to this asset

export const STATUS_LABEL: Record<CellStatus, string> = {
  breach: 'Breach',
  holding: 'Holding',
  partial: 'Partly tested',
  untested: 'Not tested yet',
  review: 'Needs manual review',
  covered: 'Covered by decision',
  na: 'Not applicable',
};

export interface Cell {
  risk: Risk;
  status: CellStatus;
  applicability: Applicability;
  planned: string[];
  tested: string[];
  failed: string[];
  skipped: { id: string; reason: string }[];
  lastTested: string | null;
  stale: boolean;
  findings: number;
  note: string;
}

export interface AssetCoverage {
  asset: Asset;
  plan: TestPlan;
  runs: RunRecord[];
  latestRun: RunRecord | null;
  cells: Cell[];
  stale: boolean;
  openFindings: OpenFinding[];
}

export interface OpenFinding extends Finding {
  assetId: string;
  runId: string;
  foundAt: string;
  sample: boolean;
}

const DAY = 86_400_000;

/** Latest tally for each plugin across all runs of an asset. */
function latestTallies(runs: RunRecord[]) {
  const latest = new Map<string, { run: RunRecord; tested: number; failed: number }>();
  for (const run of runs) {
    for (const [plugin, t] of Object.entries(run.plugins)) {
      if (t.tested === 0) continue;
      latest.set(plugin, { run, tested: t.tested, failed: t.failed });
    }
  }
  return latest;
}

function openFindingsFor(asset: Asset, runs: RunRecord[], applicable: Set<string>): OpenFinding[] {
  const tallies = latestTallies(runs);
  const open: OpenFinding[] = [];
  for (const run of runs) {
    for (const f of run.findings) {
      // The most recent run that tested this plugin is the current evidence. If that is
      // this run, the finding is open. If a later run tested it, the finding is either
      // resolved (nothing got through) or superseded by that run's own findings.
      if (tallies.get(f.pluginId)?.run.id === run.id) {
        // Promptfoo maps a plugin to every risk it can evidence; keep the ones that apply to this asset.
        const risks = f.risks.filter((r) => applicable.has(r));
        open.push({ ...f, risks, assetId: asset.id, runId: run.id, foundAt: run.startedAt, sample: Boolean(run.sample) });
      }
    }
  }
  return open;
}

export function assetCoverage(asset: Asset, allRuns: RunRecord[], catalog: Catalog = loadCatalog(), now = Date.now()): AssetCoverage {
  const plan = buildPlan(asset, catalog);
  const runs = allRuns.filter((r) => r.assetId === asset.id).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const tallies = latestTallies(runs);
  const applicable = new Set(plan.applicability.filter((a) => a.applies).map((a) => a.risk.id));
  const openFindings = openFindingsFor(asset, runs, applicable);
  const cadence = asset.testing.cadenceDays * DAY;

  const cells: Cell[] = plan.applicability.map((app) => {
    const risk = app.risk;
    const mapped = promptfooMappingFor(catalog, risk).plugins;
    const planned = plan.plugins.filter((p) => p.risks.includes(risk.id)).map((p) => p.id);
    const skipped = plan.skipped.filter((s) => s.risks.includes(risk.id)).map(({ id, reason }) => ({ id, reason }));
    // Results count for a risk when the tested plugin is one Promptfoo maps to it
    // (including sub-plugins such as harmful:hate under "harmful").
    const results = [...tallies.entries()].filter(([plugin]) => matchesPlugin(planned, plugin));
    const tested = results.map(([p]) => p);
    const failed = results.filter(([, t]) => t.failed > 0).map(([p]) => p);
    const dates = results.map(([, t]) => t.run.startedAt).sort();
    const lastTested = dates.at(-1) ?? null;
    const stale = dates.length > 0 && now - Date.parse(dates[0]) > cadence;
    const findings = openFindings.filter((f) => f.risks.includes(risk.id)).length;
    const decision = app.decision;

    let status: CellStatus;
    let note: string;
    if (!app.applies) {
      status = 'na';
      note = app.reason;
    } else if (decision && (decision.status === 'accepted' || decision.status === 'covered-manually')) {
      status = failed.length && decision.status === 'covered-manually' ? 'breach' : 'covered';
      note = `${decision.status === 'accepted' ? 'Risk accepted' : 'Covered manually'}: ${decision.reason}`;
    } else if (failed.length) {
      status = 'breach';
      note = `Attacks got through in ${failed.join(', ')}`;
    } else if (mapped.length === 0) {
      status = 'review';
      note = 'Promptfoo has no automated test for this risk. Record manual evidence in the inventory.';
    } else if (planned.length === 0) {
      status = 'review';
      note = skipped.length ? `Tests exist but cannot run here: ${skipped[0].reason}` : 'No test selected';
    } else if (tested.length === 0) {
      status = 'untested';
      note = `${planned.length} test${planned.length > 1 ? 's' : ''} planned, none run yet`;
    } else {
      const missing = planned.filter((p) => !tested.some((t) => matchesPlugin([p], t)));
      status = missing.length ? 'partial' : 'holding';
      note = missing.length ? `Not run yet: ${missing.join(', ')}` : 'Every planned test held';
    }
    return { risk, status, applicability: app, planned, tested, failed, skipped, lastTested, stale, findings, note };
  });

  const latestRun = runs.at(-1) ?? null;
  const stale = !latestRun || now - Date.parse(latestRun.startedAt) > cadence;
  return { asset, plan, runs, latestRun, cells, stale, openFindings };
}

export interface InventoryCoverage {
  assets: AssetCoverage[];
  totals: {
    assets: number;
    applicable: number;
    withEvidence: number;
    breaches: number;
    untested: number;
    review: number;
    staleAssets: number;
    findingsBySeverity: Record<Severity, number>;
  };
}

export function inventoryCoverage(assets: Asset[], runs: RunRecord[], catalog: Catalog = loadCatalog(), now = Date.now()): InventoryCoverage {
  const list = assets.map((a) => assetCoverage(a, runs, catalog, now));
  const cells = list.flatMap((a) => a.cells).filter((c) => c.status !== 'na');
  const findingsBySeverity: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, informational: 0 };
  for (const f of list.flatMap((a) => a.openFindings)) findingsBySeverity[f.severity] = (findingsBySeverity[f.severity] ?? 0) + 1;
  return {
    assets: list,
    totals: {
      assets: list.length,
      applicable: cells.length,
      withEvidence: cells.filter((c) => ['breach', 'holding', 'partial', 'covered'].includes(c.status)).length,
      breaches: cells.filter((c) => c.status === 'breach').length,
      untested: cells.filter((c) => c.status === 'untested').length,
      review: cells.filter((c) => c.status === 'review').length,
      staleAssets: list.filter((a) => a.stale).length,
      findingsBySeverity,
    },
  };
}
