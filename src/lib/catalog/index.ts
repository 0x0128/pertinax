import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { ALL_RISKS, type Risk } from './owasp';

export * from './owasp';

export interface AtlasTactic {
  id: string;
  name: string;
  summary: string;
  order: number;
  url: string;
}
export interface AtlasTechnique {
  id: string;
  name: string;
  summary: string;
  tactics: string[];
  parent: string | null;
  platforms: string[];
  maturity: string | null;
  mitigations: { id: string; name: string }[];
  url: string;
}
export interface AtlasCatalog {
  version: string;
  modified: string;
  tactics: AtlasTactic[];
  techniques: AtlasTechnique[];
}
export interface PluginInfo {
  description: string;
  severity: Severity;
  remoteOnly: boolean;
}
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'informational';
type FrameworkMapping = Record<string, { plugins: string[]; strategies: string[] }>;
export interface PromptfooCatalog {
  promptfooVersion: string;
  generatedAt: string;
  frameworks: { 'owasp:llm': FrameworkMapping; 'owasp:agentic': FrameworkMapping; 'mitre:atlas': FrameworkMapping };
  plugins: Record<string, PluginInfo>;
}
export interface TechniqueMap {
  plugins: Record<string, string[]>;
  strategies: Record<string, string[]>;
}

export interface Catalog {
  atlas: AtlasCatalog;
  promptfoo: PromptfooCatalog;
  techniqueMap: TechniqueMap;
  risks: Risk[];
  /** Promptfoo's ATLAS tactic slug (e.g. "mitre:atlas:exfiltration") -> ATLAS tactic id. */
  tacticIdBySlug: Map<string, string>;
}

// Promptfoo still uses the older tactic name "AI Attack Staging" for AML.TA0001,
// which ATLAS has since renamed "AI Attack Adaptation".
const TACTIC_SLUG_ALIASES: Record<string, string> = {
  'mitre:atlas:ai-attack-staging': 'AML.TA0001',
  'mitre:atlas:ml-attack-staging': 'AML.TA0001',
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

let cached: Catalog | null = null;

export function catalogDir(root = process.cwd()) {
  return path.join(root, 'catalog');
}

export function loadCatalog(root = process.cwd()): Catalog {
  if (cached && process.env.NODE_ENV === 'production') return cached;
  const dir = catalogDir(root);
  const read = (f: string) => fs.readFileSync(path.join(dir, f), 'utf8');
  const atlas = JSON.parse(read('atlas.json')) as AtlasCatalog;
  const promptfoo = JSON.parse(read('promptfoo.json')) as PromptfooCatalog;
  const techniqueMap = YAML.parse(read('technique-map.yaml')) as TechniqueMap;

  const tacticIdBySlug = new Map<string, string>(Object.entries(TACTIC_SLUG_ALIASES));
  for (const t of atlas.tactics) tacticIdBySlug.set(`mitre:atlas:${slug(t.name)}`, t.id);

  cached = { atlas, promptfoo, techniqueMap, risks: ALL_RISKS, tacticIdBySlug };
  return cached;
}

/** Plugins and strategies Promptfoo associates with a risk (OWASP LLM or Agentic). */
export function promptfooMappingFor(catalog: Catalog, risk: Risk) {
  const fw = risk.framework === 'owasp-llm' ? catalog.promptfoo.frameworks['owasp:llm'] : catalog.promptfoo.frameworks['owasp:agentic'];
  return fw[risk.promptfooKey] ?? { plugins: [], strategies: [] };
}

/** Risks (OWASP ids) that a given Promptfoo plugin tests, according to Promptfoo. */
export function risksForPlugin(catalog: Catalog, pluginId: string): string[] {
  return catalog.risks.filter((r) => matchesPlugin(promptfooMappingFor(catalog, r).plugins, pluginId)).map((r) => r.id);
}

/** ATLAS tactic ids a plugin or strategy maps to, according to Promptfoo. */
export function tacticsFor(catalog: Catalog, id: string, kind: 'plugin' | 'strategy' = 'plugin'): string[] {
  const out = new Set<string>();
  for (const [key, m] of Object.entries(catalog.promptfoo.frameworks['mitre:atlas'])) {
    const list = kind === 'plugin' ? m.plugins : m.strategies;
    if (matchesPlugin(list, id)) {
      const tactic = catalog.tacticIdBySlug.get(key);
      if (tactic) out.add(tactic);
    }
  }
  return [...out].sort();
}

/** ATLAS technique ids from Pertinax's curated map (catalog/technique-map.yaml). */
export function techniquesFor(catalog: Catalog, id: string, kind: 'plugin' | 'strategy' = 'plugin'): string[] {
  const map = kind === 'plugin' ? catalog.techniqueMap.plugins : catalog.techniqueMap.strategies;
  if (map[id]) return map[id];
  // A sub-plugin such as "harmful:hate" inherits its collection's mapping ("harmful").
  const collection = id.split(':')[0];
  return kind === 'plugin' && collection !== id ? (map[collection] ?? []) : [];
}

/**
 * Promptfoo lists both collections ("harmful", "pii") and concrete plugins ("harmful:hate").
 * A result from "harmful:hate" counts towards a mapping that lists "harmful".
 */
export function matchesPlugin(list: string[], pluginId: string): boolean {
  if (list.includes(pluginId)) return true;
  return list.some((p) => !p.includes(':') && pluginId.startsWith(p + ':'));
}

export function pluginInfo(catalog: Catalog, pluginId: string): PluginInfo {
  return (
    catalog.promptfoo.plugins[pluginId] ??
    catalog.promptfoo.plugins[pluginId.split(':')[0]] ?? { description: pluginId, severity: 'medium', remoteOnly: false }
  );
}

export function pluginLabel(id: string): string {
  return id
    .split(/[:-]/)
    .map((w) => (['pii', 'rag', 'mcp', 'sql', 'ssrf', 'bola', 'bfla', 'rbac', 'dos', 'api', 'db'].includes(w) ? w.toUpperCase() : w))
    .join(' ')
    .replace(/^./, (c) => c.toUpperCase());
}
