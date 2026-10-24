import type { InventoryCoverage } from './coverage';
import { loadCatalog, matchesPlugin, type AtlasTactic, type AtlasTechnique, type Catalog } from './catalog';

/**
 * Projects the inventory's test evidence onto the MITRE ATLAS matrix.
 * Tactic status uses Promptfoo's own tactic mapping; technique status uses Pertinax's
 * technique map (catalog/technique-map.yaml). A parent technique inherits evidence
 * from its sub-techniques.
 */

export type AtlasStatus = 'breach' | 'holding' | 'untested' | 'out-of-scope' | 'no-test';

export const ATLAS_STATUS_LABEL: Record<AtlasStatus, string> = {
  breach: 'Breach found',
  holding: 'Tested, held',
  untested: 'Planned, not run',
  'out-of-scope': 'Test exists, no asset needs it',
  'no-test': 'No automated test',
};

export interface TechniqueCoverage {
  technique: AtlasTechnique;
  status: AtlasStatus;
  plugins: string[];
  strategies: string[];
  assetsTested: string[];
  assetsBreached: string[];
  children: TechniqueCoverage[];
}

export interface TacticCoverage {
  tactic: AtlasTactic;
  status: AtlasStatus;
  plugins: string[];
  techniques: TechniqueCoverage[];
}

const AI_PLATFORMS = ['Generative AI', 'Agentic AI'];

function evidence(cov: InventoryCoverage, plugins: string[], strategies: string[], techniqueIds: string[]) {
  const planned = new Set<string>();
  const tested = new Set<string>();
  const breached = new Set<string>();
  for (const a of cov.assets) {
    const id = a.asset.id;
    if (a.plan.plugins.some((p) => plugins.includes(p.id)) || a.plan.strategies.some((s) => strategies.includes(s))) planned.add(id);
    for (const run of a.runs) {
      for (const [plugin, t] of Object.entries(run.plugins)) {
        if (t.tested === 0) continue;
        if (matchesPlugin(plugins, plugin) || t.strategies.some((s) => strategies.includes(s))) tested.add(id);
      }
    }
    if (a.openFindings.some((f) => f.techniques.some((t) => techniqueIds.includes(t)) || (techniqueIds.length === 0 && matchesPlugin(plugins, f.pluginId)))) {
      breached.add(id);
    }
  }
  return { planned, tested, breached };
}

function statusFrom(mapped: boolean, e: ReturnType<typeof evidence>): AtlasStatus {
  if (!mapped) return 'no-test';
  if (e.breached.size) return 'breach';
  if (e.tested.size) return 'holding';
  if (e.planned.size) return 'untested';
  return 'out-of-scope';
}

export function atlasCoverage(
  cov: InventoryCoverage,
  opts: { allPlatforms?: boolean; catalog?: Catalog } = {},
): TacticCoverage[] {
  const catalog = opts.catalog ?? loadCatalog();
  const { plugins: pMap, strategies: sMap } = catalog.techniqueMap;
  const pluginsFor = (id: string) => Object.entries(pMap).filter(([, t]) => t.includes(id)).map(([p]) => p);
  const strategiesFor = (id: string) => Object.entries(sMap).filter(([, t]) => t.includes(id)).map(([s]) => s);

  const inScope = (t: AtlasTechnique) => opts.allPlatforms || t.platforms.some((p) => AI_PLATFORMS.includes(p));

  const techniqueCov = (t: AtlasTechnique): TechniqueCoverage => {
    const children = catalog.atlas.techniques.filter((c) => c.parent === t.id).map(techniqueCov);
    const ids = [t.id, ...children.map((c) => c.technique.id)];
    const plugins = [...new Set([...pluginsFor(t.id), ...children.flatMap((c) => c.plugins)])];
    const strategies = [...new Set([...strategiesFor(t.id), ...children.flatMap((c) => c.strategies)])];
    const e = evidence(cov, plugins, strategies, ids);
    return {
      technique: t,
      status: statusFrom(plugins.length + strategies.length > 0, e),
      plugins,
      strategies,
      assetsTested: [...e.tested],
      assetsBreached: [...e.breached],
      children,
    };
  };

  return catalog.atlas.tactics.map((tactic) => {
    const slugs = [...catalog.tacticIdBySlug.entries()].filter(([, id]) => id === tactic.id).map(([s]) => s);
    const mapping = slugs.map((s) => catalog.promptfoo.frameworks['mitre:atlas'][s]).find(Boolean) ?? { plugins: [], strategies: [] };
    const techniques = catalog.atlas.techniques
      .filter((t) => !t.parent && t.tactics.includes(tactic.id) && inScope(t))
      .map(techniqueCov)
      .sort((a, b) => order(a.status) - order(b.status) || a.technique.id.localeCompare(b.technique.id));
    const e = evidence(cov, mapping.plugins, mapping.strategies, []);
    return {
      tactic,
      status: statusFrom(mapping.plugins.length + mapping.strategies.length > 0, e),
      plugins: mapping.plugins,
      techniques,
    };
  });
}

function order(s: AtlasStatus) {
  return ['breach', 'untested', 'holding', 'out-of-scope', 'no-test'].indexOf(s);
}
