import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AssetSchema, type AssetInput } from '@/lib/schema';
import { applicability } from '@/lib/applicability';
import { buildPlan } from '@/lib/plan';
import { toPromptfooConfig } from '@/lib/generate';
import { ingestPromptfooOutput } from '@/lib/ingest';
import { assetCoverage } from '@/lib/coverage';
import { loadCatalog, risksForPlugin, tacticsFor } from '@/lib/catalog';
import { loadInventory } from '@/lib/inventory';

const catalog = loadCatalog();
const asset = (over: Partial<AssetInput> = {}) =>
  AssetSchema.parse({ id: 'test-asset', name: 'Test', kind: 'chatbot', owner: 'me', ...over });

describe('catalog', () => {
  it('every technique in technique-map.yaml exists in ATLAS', () => {
    const ids = new Set(catalog.atlas.techniques.map((t) => t.id));
    const mapped = [...Object.values(catalog.techniqueMap.plugins), ...Object.values(catalog.techniqueMap.strategies)].flat();
    expect(mapped.filter((id) => !ids.has(id))).toEqual([]);
  });

  it('every Promptfoo ATLAS tactic resolves to an ATLAS tactic id', () => {
    const unresolved = Object.keys(catalog.promptfoo.frameworks['mitre:atlas']).filter((k) => !catalog.tacticIdBySlug.has(k));
    expect(unresolved).toEqual([]);
  });

  it('maps plugins to OWASP risks and ATLAS tactics using Promptfoo’s own mapping', () => {
    expect(risksForPlugin(catalog, 'prompt-extraction')).toEqual(expect.arrayContaining(['LLM07']));
    expect(risksForPlugin(catalog, 'harmful:hate')).toContain('LLM01'); // sub-plugin of the "harmful" collection
    expect(tacticsFor(catalog, 'prompt-extraction')).toContain('AML.TA0010'); // Exfiltration
  });
});

describe('applicability', () => {
  it('a plain chatbot gets no agentic risks and no retrieval risks', () => {
    const apps = applicability(asset());
    const applies = apps.filter((a) => a.applies).map((a) => a.risk.id);
    expect(applies).toContain('LLM01');
    expect(applies).not.toContain('LLM08');
    expect(applies.some((id) => id.startsWith('ASI'))).toBe(false);
  });

  it('an agent with an execute tool picks up code-execution and tool risks', () => {
    const apps = applicability(
      asset({ kind: 'agent', capabilities: { tools: [{ name: 'run_sql', access: 'execute' }], autonomy: 'supervised' } }),
    );
    const applies = new Set(apps.filter((a) => a.applies).map((a) => a.risk.id));
    for (const id of ['LLM06', 'ASI01', 'ASI02', 'ASI05']) expect(applies.has(id)).toBe(true);
  });

  it('a not-applicable decision wins over the rules and keeps its reason', () => {
    const app = applicability(asset({ risks: { LLM09: { status: 'not-applicable', reason: 'Answers are fixed templates' } } }))
      .find((a) => a.risk.id === 'LLM09')!;
    expect(app.applies).toBe(false);
    expect(app.reason).toBe('Answers are fixed templates');
  });
});

describe('plan', () => {
  it('leaves out plugins the asset cannot exercise, with a reason', () => {
    const plan = buildPlan(asset(), catalog);
    const ids = plan.plugins.map((p) => p.id);
    expect(ids).toContain('prompt-extraction');
    expect(ids).not.toContain('sql-injection');
    expect(plan.skipped.find((s) => s.id === 'indirect-prompt-injection')?.reason).toMatch(/indirectInjectionVar/);
  });

  it('drops remote-only plugins when remote generation is off', () => {
    const plan = buildPlan(asset({ testing: { remoteGeneration: false } }), catalog);
    expect(plan.plugins.some((p) => catalog.promptfoo.plugins[p.id]?.remoteOnly)).toBe(false);
  });

  it('writes a Promptfoo config that carries the asset id', () => {
    const cfg = toPromptfooConfig(buildPlan(asset({ target: { id: 'echo' } }), catalog)) as {
      redteam: { plugins: unknown[] };
      metadata: { pertinaxAsset: string };
    };
    expect(cfg.metadata.pertinaxAsset).toBe('test-asset');
    expect(cfg.redteam.plugins.length).toBeGreaterThan(0);
  });
});

describe('ingest', () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'promptfoo-eval-results.json'), 'utf8'));

  it('reads real `promptfoo eval -o results.json` output', () => {
    const run = ingestPromptfooOutput(fixture, { assetId: 'demo-bot', catalog });
    expect(run.stats).toMatchObject({ total: 2, passed: 1, failed: 1, errors: 0 });
    expect(run.findings).toHaveLength(1);
    const [f] = run.findings;
    expect(f.pluginId).toBe('prompt-extraction');
    expect(f.risks).toContain('LLM07');
    expect(f.techniques).toContain('AML.T0056');
  });

  it('marks a risk as a breach when its latest test failed, and holding once it passes', () => {
    const a = asset({ capabilities: {} });
    const failing = ingestPromptfooOutput(fixture, { assetId: a.id, catalog });
    const cov1 = assetCoverage(a, [failing], catalog, Date.parse('2026-10-25'));
    expect(cov1.cells.find((c) => c.risk.id === 'LLM07')?.status).toBe('breach');
    expect(cov1.openFindings).toHaveLength(1);

    const fixed = {
      ...failing,
      id: 'later',
      startedAt: '2099-01-01T00:00:00.000Z',
      findings: [],
      plugins: { 'prompt-extraction': { tested: 2, passed: 2, failed: 0, errors: 0, strategies: ['basic'] } },
    };
    const cov2 = assetCoverage(a, [failing, fixed], catalog, Date.parse('2099-01-02'));
    expect(cov2.openFindings).toHaveLength(0);
    expect(cov2.cells.find((c) => c.risk.id === 'LLM07')?.status).not.toBe('breach');
  });
});

describe('inventory', () => {
  it('the example inventory is valid', () => {
    const { assets, issues } = loadInventory();
    expect(issues).toEqual([]);
    expect(assets.length).toBeGreaterThan(0);
  });
});
