import type { Asset } from './schema';
import { applicability, type Applicability } from './applicability';
import { loadCatalog, matchesPlugin, pluginInfo, promptfooMappingFor, type Catalog } from './catalog';

/**
 * Turns "which risks apply" into "which Promptfoo plugins and strategies to run",
 * keeping a reason for every plugin that is added or left out.
 */

export interface PlannedPlugin {
  id: string;
  risks: string[];
  config?: Record<string, unknown>;
}
export interface SkippedPlugin {
  id: string;
  risks: string[];
  reason: string;
}
export interface TestPlan {
  asset: Asset;
  applicability: Applicability[];
  plugins: PlannedPlugin[];
  skipped: SkippedPlugin[];
  strategies: string[];
  numTests: number;
  /** Applicable risks Promptfoo has no automated test for. */
  manualRisks: string[];
}

const DEPTH = {
  quick: { numTests: 1, strategies: ['basic'] },
  standard: { numTests: 3, strategies: ['basic', 'jailbreak:composite'] },
  deep: { numTests: 5, strategies: null }, // null = every strategy Promptfoo maps to the applicable risks
} as const;

// Plugins only make sense when the asset has the capability they exercise.
// Each gate returns why the plugin cannot run on this asset, or null if it can.
function gate(asset: Asset, plugin: string): string | null {
  const c = asset.capabilities;
  const tools = c.tools.length > 0;
  if (plugin.startsWith('rag-') && !c.rag) return 'No retrieval pipeline in the inventory';
  if (plugin === 'agentic:memory-poisoning' && !c.memory) return 'No persistent memory in the inventory';
  if (plugin === 'cross-session-leak' && !c.memory && asset.kind !== 'chatbot' && asset.kind !== 'copilot')
    return 'Single-session asset with no memory';
  if (plugin === 'mcp' && asset.kind !== 'mcp-server' && !c.tools.some((t) => t.source === 'mcp'))
    return 'No MCP tools in the inventory';
  if (['tool-discovery', 'bola', 'bfla', 'rbac', 'sql-injection', 'ssrf'].includes(plugin) && !tools)
    return 'No tools in the inventory';
  if (plugin === 'shell-injection' && !tools && !c.codeExecution) return 'No tools or code execution in the inventory';
  if (plugin === 'intent' || plugin === 'policy')
    return 'Needs intents or policies written for this asset; add them with testing.includePlugins';
  if (plugin === 'indirect-prompt-injection' && !asset.testing.indirectInjectionVar)
    return 'Set testing.indirectInjectionVar to the variable that carries retrieved content';
  return null;
}

export function buildPlan(asset: Asset, catalog: Catalog = loadCatalog()): TestPlan {
  const apps = applicability(asset);
  const depth = DEPTH[asset.testing.depth];
  const byPlugin = new Map<string, Set<string>>();
  const strategies = new Set<string>(depth.strategies ?? ['basic']);
  const manualRisks: string[] = [];

  for (const a of apps) {
    if (!a.applies) continue;
    const m = promptfooMappingFor(catalog, a.risk);
    if (m.plugins.length === 0) manualRisks.push(a.risk.id);
    for (const p of m.plugins) {
      if (!byPlugin.has(p)) byPlugin.set(p, new Set());
      byPlugin.get(p)!.add(a.risk.id);
    }
    if (depth.strategies === null) m.strategies.forEach((s) => strategies.add(s));
  }
  const manual = new Map<string, Record<string, unknown> | undefined>();
  for (const p of asset.testing.includePlugins) {
    const id = typeof p === 'string' ? p : p.id;
    manual.set(id, typeof p === 'string' ? undefined : p.config);
  }

  const plugins: PlannedPlugin[] = [];
  const skipped: SkippedPlugin[] = [];
  for (const [id, risks] of [...byPlugin.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const riskList = [...risks].sort();
    if (asset.testing.excludePlugins.some((x) => matchesPlugin([x], id))) {
      skipped.push({ id, risks: riskList, reason: 'Excluded in testing.excludePlugins' });
      continue;
    }
    if (manual.has(id)) continue; // added below, with the config written in the inventory
    const blocked = gate(asset, id);
    if (blocked) {
      skipped.push({ id, risks: riskList, reason: blocked });
      continue;
    }
    if (!asset.testing.remoteGeneration && pluginInfo(catalog, id).remoteOnly) {
      skipped.push({ id, risks: riskList, reason: 'Needs Promptfoo remote generation (testing.remoteGeneration is off)' });
      continue;
    }
    const planned: PlannedPlugin = { id, risks: riskList };
    if (id === 'indirect-prompt-injection') planned.config = { indirectInjectionVar: asset.testing.indirectInjectionVar };
    plugins.push(planned);
  }
  for (const [id, config] of manual) {
    plugins.push({ id, risks: byPlugin.has(id) ? [...byPlugin.get(id)!].sort() : [], ...(config ? { config } : {}) });
  }

  return {
    asset,
    applicability: apps,
    plugins,
    skipped,
    strategies: asset.testing.strategies ?? [...strategies],
    numTests: asset.testing.numTests ?? depth.numTests,
    manualRisks,
  };
}
