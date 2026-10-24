import Link from 'next/link';
import { loadAll } from '@/lib/data';
import { FindingList } from '@/components/FindingList';
import { Notices } from '@/components/Notices';
import type { Severity } from '@/lib/catalog';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Findings' };

const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low', 'informational'];
const RANK = Object.fromEntries(SEVERITIES.map((s, i) => [s, i]));

export default async function FindingsPage({
  searchParams,
}: {
  searchParams: Promise<{ severity?: string; asset?: string; risk?: string }>;
}) {
  const q = await searchParams;
  const { coverage, usingSamples, inventory } = loadAll();
  const all = coverage.assets.flatMap((a) => a.openFindings);
  const findings = all
    .filter((f) => !q.severity || f.severity === q.severity)
    .filter((f) => !q.asset || f.assetId === q.asset)
    .filter((f) => !q.risk || f.risks.includes(q.risk))
    .sort((a, b) => RANK[a.severity] - RANK[b.severity] || b.foundAt.localeCompare(a.foundAt));

  const link = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ ...q, ...patch }).filter(([, v]) => v) as [string, string][]);
    const s = p.toString();
    return s ? `/findings?${s}` : '/findings';
  };

  return (
    <>
      <Notices usingSamples={usingSamples} issues={inventory.issues} />
      <div className="stack" style={{ ['--gap' as string]: '12px' }}>
        <h1>Open findings</h1>
        <p className="lede">
          Attacks that got through in the most recent test of each plugin. A finding closes when a later run tests the same
          plugin and nothing gets through.
        </p>
      </div>

      <div className="section">
        <div className="filters">
          <span className="faint">Severity</span>
          <Link href={link({ severity: undefined })} aria-current={!q.severity ? 'true' : undefined}>
            All ({all.length})
          </Link>
          {SEVERITIES.map((s) => {
            const n = all.filter((f) => f.severity === s).length;
            return n ? (
              <Link key={s} href={link({ severity: s })} aria-current={q.severity === s ? 'true' : undefined}>
                {s} ({n})
              </Link>
            ) : null;
          })}
        </div>
        <div className="filters">
          <span className="faint">Asset</span>
          <Link href={link({ asset: undefined })} aria-current={!q.asset ? 'true' : undefined}>
            All
          </Link>
          {coverage.assets
            .filter((a) => a.openFindings.length)
            .map((a) => (
              <Link key={a.asset.id} href={link({ asset: a.asset.id })} aria-current={q.asset === a.asset.id ? 'true' : undefined}>
                {a.asset.name}
              </Link>
            ))}
          {q.risk && (
            <Link href={link({ risk: undefined })} aria-current="true">
              Risk {q.risk} (clear)
            </Link>
          )}
        </div>
        <FindingList findings={findings} />
      </div>
    </>
  );
}
