import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { AssetSchema, type Asset } from './schema';

export interface InventoryIssue {
  file: string;
  message: string;
}

export interface Inventory {
  assets: Asset[];
  issues: InventoryIssue[];
}

// The inventory is user data read at request time, so it is excluded from Next's file tracing.
export function inventoryDir(root = process.cwd()) {
  return process.env.PERTINAX_INVENTORY ?? path.join(root, 'inventory', 'assets');
}

export function loadInventory(root = process.cwd()): Inventory {
  const dir = inventoryDir(root);
  const assets: Asset[] = [];
  const issues: InventoryIssue[] = [];
  if (!fs.existsSync(/*turbopackIgnore: true*/ dir)) return { assets, issues: [{ file: dir, message: 'Inventory folder not found' }] };

  const files = fs.readdirSync(/*turbopackIgnore: true*/ dir).filter((f) => /\.ya?ml$/.test(f)).sort();
  const seen = new Map<string, string>();
  for (const file of files) {
    const rel = path.relative(root, path.join(dir, file));
    let raw: unknown;
    try {
      raw = YAML.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    } catch (err) {
      issues.push({ file: rel, message: `Invalid YAML: ${(err as Error).message}` });
      continue;
    }
    const parsed = AssetSchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        issues.push({ file: rel, message: `${issue.path.join('.') || '(root)'}: ${issue.message}` });
      }
      continue;
    }
    const asset = parsed.data;
    if (seen.has(asset.id)) {
      issues.push({ file: rel, message: `Duplicate id "${asset.id}" (also in ${seen.get(asset.id)})` });
      continue;
    }
    seen.set(asset.id, rel);
    assets.push(asset);
  }
  return { assets, issues };
}

export function getAsset(id: string, root = process.cwd()): Asset | undefined {
  return loadInventory(root).assets.find((a) => a.id === id);
}
