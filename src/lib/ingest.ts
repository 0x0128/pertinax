import { z } from 'zod';
import {
  loadCatalog,
  pluginInfo,
  risksForPlugin,
  tacticsFor,
  techniquesFor,
  type Catalog,
  type Severity,
} from './catalog';

/**
 * Reads the JSON that `promptfoo eval -o results.json` writes and turns it into a
 * Pertinax run: per-plugin tallies plus one finding per failed attack, each mapped to
 * OWASP risks, ATLAS tactics (Promptfoo's mapping) and ATLAS techniques (Pertinax's map).
 */

// Only the fields Pertinax needs; everything else in Promptfoo's output is ignored.
const PromptfooResult = z.object({
  success: z.boolean(),
  error: z.string().nullish(),
  failureReason: z.number().optional(),
  vars: z.record(z.string(), z.unknown()).optional(),
  prompt: z.object({ raw: z.string().optional() }).loose().optional(),
  response: z.object({ output: z.unknown().optional() }).loose().nullish(),
  gradingResult: z.object({ reason: z.string().optional() }).loose().nullish(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  testCase: z.object({ metadata: z.record(z.string(), z.unknown()).optional() }).loose().optional(),
  provider: z.object({ id: z.string().optional(), label: z.string().optional() }).loose().optional(),
});

const PromptfooOutput = z.object({
  evalId: z.string().nullish(),
  results: z.object({
    timestamp: z.string().optional(),
    results: z.array(PromptfooResult),
  }),
  config: z.object({ metadata: z.record(z.string(), z.unknown()).optional() }).loose().optional(),
});

export interface Finding {
  id: string;
  pluginId: string;
  strategyId: string;
  severity: Severity;
  risks: string[];
  tactics: string[];
  techniques: string[];
  attack: string;
  output: string;
  reason: string;
  goal?: string;
}

export interface PluginTally {
  tested: number;
  passed: number;
  failed: number;
  errors: number;
  strategies: string[];
}

export interface RunRecord {
  id: string;
  assetId: string;
  startedAt: string;
  source: 'promptfoo';
  sample?: boolean;
  stats: { total: number; passed: number; failed: number; errors: number };
  plugins: Record<string, PluginTally>;
  findings: Finding[];
}

const MAX_TEXT = 2000;
const clip = (v: unknown) => {
  const s = typeof v === 'string' ? v : v == null ? '' : JSON.stringify(v);
  return s.length > MAX_TEXT ? s.slice(0, MAX_TEXT) + ' […]' : s;
};

export function ingestPromptfooOutput(
  json: unknown,
  opts: { assetId?: string; catalog?: Catalog } = {},
): RunRecord {
  const catalog = opts.catalog ?? loadCatalog();
  const out = PromptfooOutput.parse(json);
  const assetId =
    opts.assetId ??
    (out.config?.metadata?.pertinaxAsset as string | undefined) ??
    out.results.results[0]?.provider?.label;
  if (!assetId) throw new Error('Cannot tell which asset this run belongs to; pass the asset id explicitly');

  const startedAt = out.results.timestamp ?? new Date().toISOString();
  const runId = out.evalId ?? `run-${startedAt.replace(/[:.]/g, '-')}`;
  const plugins: Record<string, PluginTally> = {};
  const findings: Finding[] = [];
  const stats = { total: 0, passed: 0, failed: 0, errors: 0 };

  out.results.results.forEach((r, i) => {
    const meta = { ...(r.testCase?.metadata ?? {}), ...(r.metadata ?? {}) };
    const pluginId = typeof meta.pluginId === 'string' ? meta.pluginId : 'unmapped';
    const strategyId = typeof meta.strategyId === 'string' ? meta.strategyId : 'basic';
    // Promptfoo's ResultFailureReason: 0 none, 1 assertion failed, 2 error. It also fills
    // `error` for failed assertions, so only fall back to it when failureReason is missing.
    const isError = r.failureReason === 2 || (r.failureReason === undefined && Boolean(r.error) && !r.gradingResult);

    stats.total++;
    const t = (plugins[pluginId] ??= { tested: 0, passed: 0, failed: 0, errors: 0, strategies: [] });
    if (!t.strategies.includes(strategyId)) t.strategies.push(strategyId);
    if (isError) {
      stats.errors++;
      t.errors++;
      return;
    }
    t.tested++;
    if (r.success) {
      stats.passed++;
      t.passed++;
      return;
    }
    stats.failed++;
    t.failed++;

    const attack = r.vars?.prompt ?? Object.values(r.vars ?? {}).find((v) => typeof v === 'string') ?? r.prompt?.raw;
    findings.push({
      id: `${runId}#${i}`,
      pluginId,
      strategyId,
      severity: ((meta.severity as Severity | undefined) ?? pluginInfo(catalog, pluginId).severity) as Severity,
      risks: risksForPlugin(catalog, pluginId),
      tactics: [...new Set([...tacticsFor(catalog, pluginId), ...tacticsFor(catalog, strategyId, 'strategy')])].sort(),
      techniques: [...new Set([...techniquesFor(catalog, pluginId), ...techniquesFor(catalog, strategyId, 'strategy')])].sort(),
      attack: clip(attack),
      output: clip(r.response?.output),
      reason: clip(r.gradingResult?.reason ?? r.error ?? ''),
      goal: typeof meta.goal === 'string' ? meta.goal : undefined,
    });
  });

  return { id: runId, assetId, startedAt, source: 'promptfoo', stats, plugins, findings };
}
