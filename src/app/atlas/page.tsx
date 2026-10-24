import Link from 'next/link';
import { loadAll } from '@/lib/data';
import { atlasCoverage, ATLAS_STATUS_LABEL, type AtlasStatus } from '@/lib/atlas-coverage';
import { Notices } from '@/components/Notices';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'MITRE ATLAS' };

const STATUSES: AtlasStatus[] = ['breach', 'holding', 'untested', 'out-of-scope', 'no-test'];

export default async function AtlasPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const { all } = await searchParams;
  const { coverage, catalog, usingSamples, inventory } = loadAll();
  const tactics = atlasCoverage(coverage, { allPlatforms: all === '1', catalog });
  const techniques = tactics.flatMap((t) => t.techniques);
  const unique = new Map(techniques.map((t) => [t.technique.id, t]));
  const count = (s: AtlasStatus) => [...unique.values()].filter((t) => t.status === s).length;

  return (
    <>
      <Notices usingSamples={usingSamples} issues={inventory.issues} />
      <div className="stack" style={{ ['--gap' as string]: '12px' }}>
        <h1>Your inventory on the ATLAS matrix</h1>
        <p className="lede">
          {count('breach')} techniques have a working attack against at least one asset; {count('holding')} were tested and held.{' '}
          {count('no-test')} of {unique.size} techniques have no automated Promptfoo test and need other evidence.
        </p>
        <p className="small muted">
          ATLAS {catalog.atlas.version}. Tactic bars use Promptfoo’s tactic mapping; techniques use the Pertinax map in{' '}
          <code>catalog/technique-map.yaml</code>. A technique inherits evidence from its sub-techniques.
        </p>
      </div>

      <div className="filters" style={{ marginTop: 24 }}>
        <span className="faint">Show</span>
        <Link href="/atlas" aria-current={all !== '1' ? 'true' : undefined}>
          Generative and agentic AI techniques
        </Link>
        <Link href="/atlas?all=1" aria-current={all === '1' ? 'true' : undefined}>
          All techniques
        </Link>
      </div>
      <ul className="legend" style={{ marginBottom: 20 }}>
        {STATUSES.map((s) => (
          <li key={s}>
            <span className={`tech ${s} swatch`} style={{ padding: 0, margin: 0 }} /> {ATLAS_STATUS_LABEL[s]}
          </li>
        ))}
      </ul>

      <p className="small faint" style={{ marginBottom: 12 }}>
        {tactics.length} tactics in matrix order. Scroll sideways to see them all; hover a technique for details.
      </p>
      <div className="atlas">
        {tactics.map((t) => (
          <section key={t.tactic.id} className="tactic">
            <h3>
              <a href={t.tactic.url} target="_blank" rel="noreferrer" title={t.tactic.summary}>
                {t.tactic.name}
              </a>
            </h3>
            <div className={`tactic-bar ${t.status}`} title={ATLAS_STATUS_LABEL[t.status]} />
            {t.techniques.map((tc) => (
              <a
                key={tc.technique.id}
                href={tc.technique.url}
                target="_blank"
                rel="noreferrer"
                className={`tech ${tc.status}`}
                title={[
                  tc.technique.summary,
                  ATLAS_STATUS_LABEL[tc.status],
                  tc.plugins.length ? `Tests: ${[...tc.plugins, ...tc.strategies].join(', ')}` : '',
                  tc.assetsBreached.length ? `Breached: ${tc.assetsBreached.join(', ')}` : '',
                ]
                  .filter(Boolean)
                  .join('\n')}
              >
                {tc.technique.name}
                <small>
                  {tc.technique.id}
                  {tc.assetsBreached.length > 0 && `, ${tc.assetsBreached.length} breached`}
                </small>
              </a>
            ))}
            {t.techniques.length === 0 && <p className="small faint">No techniques for this filter.</p>}
          </section>
        ))}
      </div>
    </>
  );
}
