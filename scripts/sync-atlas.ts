/**
 * Downloads the latest MITRE ATLAS release from github.com/mitre-atlas/atlas-data and
 * compiles it into catalog/atlas.json: tactics in matrix order, techniques with their
 * tactics, parent technique and mitigations.
 *
 *   npm run sync:atlas                 # latest release
 *   npm run sync:atlas -- ./ATLAS.yaml # compile a local copy instead
 *
 * ATLAS data © MITRE, Apache License 2.0. See NOTICE.
 */
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

const RAW = 'https://raw.githubusercontent.com/mitre-atlas/atlas-data/main/dist';

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.text();
}

// dist/ATLAS-latest.yaml and dist/v6/ATLAS-latest.yaml are git symlinks: raw.githubusercontent
// serves the link target as plain text, so follow them until we reach the real YAML.
async function fetchLatest(): Promise<string> {
  let url = `${RAW}/ATLAS-latest.yaml`;
  for (let hop = 0; hop < 5; hop++) {
    const text = await fetchText(url);
    const trimmed = text.trim();
    if (trimmed.length < 200 && /^[\w./-]+\.ya?ml$/.test(trimmed)) {
      url = new URL(trimmed, url).toString();
      continue;
    }
    return text;
  }
  throw new Error('Too many symlink hops resolving ATLAS-latest.yaml');
}

interface RawAtlas {
  'format-version': string;
  collection: { version: string; 'modified-date': string };
  tactics: Record<string, { name: string; description: string }>;
  techniques: Record<string, { name: string; description: string; platforms?: string[]; maturity?: string }>;
  mitigations: Record<string, { name: string }>;
  relationships: Record<
    string,
    Record<string, Array<{ source: string; target: string; 'relationship-type': string; position?: number }>>
  >;
}

function firstSentence(text: string, max = 220): string {
  const flat = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\s+/g, ' ').trim();
  const end = flat.search(/(?<=[.!?])\s/);
  const sentence = end > 0 ? flat.slice(0, end) : flat;
  return sentence.length > max ? sentence.slice(0, max - 1).trimEnd() + '…' : sentence;
}

async function main() {
  const local = process.argv[2];
  const text = local ? fs.readFileSync(local, 'utf8') : await fetchLatest();
  const raw = YAML.parse(text) as RawAtlas;
  if (!raw['format-version']?.startsWith('6.')) {
    throw new Error(`Unsupported ATLAS format ${raw['format-version']}; this script expects format 6.x`);
  }

  const rels = Object.values(raw.relationships).flatMap((group) => Object.values(group).flat());
  const order = new Map(
    rels.filter((r) => r['relationship-type'] === 'sequences').map((r) => [r.target, r.position ?? 999]),
  );
  const achieves = new Map<string, string[]>();
  const parent = new Map<string, string>();
  const mitigatedBy = new Map<string, string[]>();
  for (const r of rels) {
    if (r['relationship-type'] === 'achieves') achieves.set(r.source, [...(achieves.get(r.source) ?? []), r.target]);
    if (r['relationship-type'] === 'specializes') parent.set(r.source, r.target);
    if (r['relationship-type'] === 'mitigates') mitigatedBy.set(r.target, [...(mitigatedBy.get(r.target) ?? []), r.source]);
  }

  const tactics = Object.entries(raw.tactics)
    .map(([id, t]) => ({
      id,
      name: t.name,
      summary: firstSentence(t.description),
      order: order.get(id) ?? 999,
      url: `https://atlas.mitre.org/tactics/${id}`,
    }))
    .sort((a, b) => a.order - b.order);

  const techniques = Object.entries(raw.techniques).map(([id, t]) => ({
    id,
    name: t.name,
    summary: firstSentence(t.description),
    tactics: (achieves.get(id) ?? achieves.get(parent.get(id) ?? '') ?? []).sort(),
    parent: parent.get(id) ?? null,
    platforms: t.platforms ?? [],
    maturity: t.maturity ?? null,
    mitigations: (mitigatedBy.get(id) ?? []).sort().map((m) => ({ id: m, name: raw.mitigations[m]?.name ?? m })),
    url: `https://atlas.mitre.org/techniques/${id}`,
  }));

  const out = {
    source: 'https://github.com/mitre-atlas/atlas-data',
    license: 'Apache-2.0 © MITRE',
    version: raw.collection.version,
    modified: raw.collection['modified-date'],
    tactics,
    techniques,
  };
  const target = path.join(process.cwd(), 'catalog', 'atlas.json');
  fs.writeFileSync(target, JSON.stringify(out, null, 2) + '\n');
  console.log(`Wrote catalog/atlas.json: ATLAS ${out.version}, ${tactics.length} tactics, ${techniques.length} techniques`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
