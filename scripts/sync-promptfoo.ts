/**
 * Extracts Promptfoo's own framework mappings (OWASP LLM Top 10, OWASP Agentic Top 10,
 * MITRE ATLAS tactics), plugin descriptions and default severities from the installed
 * `promptfoo` package and writes them to catalog/promptfoo.json.
 *
 * Pertinax never hard-codes which Promptfoo plugin covers which risk: it reads what
 * Promptfoo itself declares, so upgrading Promptfoo and re-running this script keeps
 * both tools in agreement.
 *
 *   npm run sync:promptfoo
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = process.cwd();
const pkgDir = path.join(root, 'node_modules', 'promptfoo');
const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')) as { version: string };

type Mapping = Record<string, { plugins: string[]; strategies: string[] }>;
interface PromptfooConstants {
  ALIASED_PLUGIN_MAPPINGS: Record<string, Mapping>;
  pluginDescriptions: Record<string, string>;
  riskCategorySeverityMap: Record<string, string>;
  REMOTE_ONLY_PLUGIN_IDS: string[];
}

// Promptfoo bundles its constants into a hashed chunk (dist/src/tables-<hash>.cjs).
// Find the chunk that exports the mappings instead of depending on the hash.
function loadConstants(): PromptfooConstants {
  const srcDir = path.join(pkgDir, 'dist', 'src');
  const candidates = fs.readdirSync(srcDir).filter((f) => f.endsWith('.cjs'));
  for (const file of candidates) {
    const text = fs.readFileSync(path.join(srcDir, file), 'utf8');
    if (!text.includes('ALIASED_PLUGIN_MAPPINGS')) continue;
    const mod = require(path.join(srcDir, file)) as Partial<PromptfooConstants>;
    if (mod.ALIASED_PLUGIN_MAPPINGS && mod.pluginDescriptions) return mod as PromptfooConstants;
  }
  throw new Error(`Could not find Promptfoo framework mappings in ${srcDir}. Has the package layout changed?`);
}

const c = loadConstants();
const frameworks = ['owasp:llm', 'owasp:agentic', 'mitre:atlas'] as const;
const out = {
  promptfooVersion: pkg.version,
  generatedAt: new Date().toISOString(),
  frameworks: Object.fromEntries(frameworks.map((f) => [f, c.ALIASED_PLUGIN_MAPPINGS[f]])),
  plugins: Object.fromEntries(
    Object.keys(c.pluginDescriptions)
      .sort()
      .map((id) => [
        id,
        {
          description: c.pluginDescriptions[id],
          severity: c.riskCategorySeverityMap[id] ?? 'medium',
          remoteOnly: c.REMOTE_ONLY_PLUGIN_IDS.includes(id),
        },
      ]),
  ),
};

for (const f of frameworks) {
  if (!out.frameworks[f]) throw new Error(`Promptfoo ${pkg.version} has no "${f}" mapping`);
}

const target = path.join(root, 'catalog', 'promptfoo.json');
fs.writeFileSync(target, JSON.stringify(out, null, 2) + '\n');
console.log(`Wrote ${path.relative(root, target)} from promptfoo ${pkg.version} (${Object.keys(out.plugins).length} plugins)`);
