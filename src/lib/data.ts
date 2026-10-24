import { loadInventory } from './inventory';
import { loadRuns } from './runs';
import { inventoryCoverage } from './coverage';
import { loadCatalog } from './catalog';

/** Everything a dashboard page needs, read fresh from disk on each request. */
export function loadAll() {
  const catalog = loadCatalog();
  const inventory = loadInventory();
  const { runs, usingSamples } = loadRuns();
  const coverage = inventoryCoverage(inventory.assets, runs, catalog);
  return { catalog, inventory, runs, usingSamples, coverage };
}

export function formatDate(iso: string | null | undefined) {
  if (!iso) return 'never';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function daysAgo(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return null;
  return Math.floor((now - Date.parse(iso)) / 86_400_000);
}
