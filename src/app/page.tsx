import Link from 'next/link';
import { loadAll, formatDate } from '@/lib/data';
import { Wall } from '@/components/Wall';
import { Legend } from '@/components/Shield';
import { Notices } from '@/components/Notices';
import type { Severity } from '@/lib/catalog';

export const dynamic = 'force-dynamic';

const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low'];

export default function Overview() {
  const { coverage, usingSamples, inventory } = loadAll();
  const { totals, assets } = coverage;
  const breachedAssets = assets.filter((a) => a.cells.some((c) => c.status === 'breach')).length;
  const neverRun = assets.filter((a) => a.runs.length === 0);
  const gaps = assets
    .map((a) => ({ a, n: a.cells.filter((c) => c.status === 'untested' || c.status === 'review').length }))
    .filter((g) => g.n > 0)
    .sort((x, y) => y.n - x.n);
  const latest = assets
    .flatMap((a) => a.runs.map((r) => ({ r, a })))
    .sort((x, y) => y.r.startedAt.localeCompare(x.r.startedAt))
    .slice(0, 6);
  const openFindings = Object.values(totals.findingsBySeverity).reduce((s, n) => s + n, 0);

  return (
    <>
      <Notices usingSamples={usingSamples} issues={inventory.issues} />

      <div className="hero">
        <div className="stack" style={{ ['--gap' as string]: '20px' }}>
          <h1>
            {totals.assets === 0
              ? 'Add your first AI asset to start'
              : breachedAssets === 0
                ? `No attack gets through on any of ${totals.assets} assets`
                : `${breachedAssets} of ${totals.assets} AI assets let an attack through`}
          </h1>
          <p className="lede">
            {totals.withEvidence} of {totals.applicable} applicable risks have test evidence or a recorded decision.{' '}
            {totals.untested > 0 && `${totals.untested} have tests that never ran. `}
            {totals.review > 0 && `${totals.review} need manual review because Promptfoo cannot test them.`}
          </p>
        </div>
        <div className="figures">
          <Figure value={openFindings} label="open findings" href="/findings" />
          {SEVERITIES.map((s) => (
            <Figure key={s} value={totals.findingsBySeverity[s]} label={`${s} severity`} href={`/findings?severity=${s}`} />
          ))}
          <Figure value={totals.staleAssets} label={totals.staleAssets === 1 ? 'asset due for re-test' : 'assets due for re-test'} href="/assets" />
        </div>
      </div>

      <section className="section">
        <div className="section-head">
          <h2>Shield wall</h2>
          <Link href="/coverage" className="small">
            Open coverage by risk
          </Link>
        </div>
        <Wall assets={assets} />
        <Legend />
      </section>

      <div className="section cols">
        <section>
          <div className="section-head">
            <h2>Where the wall is open</h2>
          </div>
          {gaps.length === 0 ? (
            <p className="muted">Every applicable risk has evidence or a decision.</p>
          ) : (
            <table className="table">
              <tbody>
                {gaps.slice(0, 6).map(({ a, n }) => (
                  <tr key={a.asset.id}>
                    <td>
                      <Link href={`/assets/${a.asset.id}`}>{a.asset.name}</Link>
                      <div className="small faint">{a.runs.length === 0 ? 'Never tested' : `Last run ${formatDate(a.latestRun?.startedAt)}`}</div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {n} {n === 1 ? 'risk' : 'risks'} without evidence
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {neverRun.length > 0 && (
            <p className="small muted" style={{ marginTop: 12 }}>
              Never tested: {neverRun.map((a) => a.asset.name).join(', ')}.
            </p>
          )}
        </section>

        <section>
          <div className="section-head">
            <h2>Latest runs</h2>
          </div>
          {latest.length === 0 ? (
            <p className="muted">
              No runs yet. Try <code>npm run pertinax -- run demo-bot</code>.
            </p>
          ) : (
            <table className="table">
              <tbody>
                {latest.map(({ r, a }) => (
                  <tr key={`${a.asset.id}-${r.id}`}>
                    <td>
                      <Link href={`/assets/${a.asset.id}`}>{a.asset.name}</Link>
                      <div className="small faint">{formatDate(r.startedAt)}</div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {r.stats.failed > 0 ? (
                        <span>
                          <b>{r.stats.failed}</b> of {r.stats.total} attacks got through
                        </span>
                      ) : (
                        <span className="muted">{r.stats.total} attacks, none got through</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </>
  );
}

function Figure({ value, label, href }: { value: number; label: string; href: string }) {
  return (
    <Link href={href} className="figure" style={{ textDecoration: 'none' }}>
      <b>{value}</b>
      <span>{label}</span>
    </Link>
  );
}
