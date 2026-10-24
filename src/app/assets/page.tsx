import Link from 'next/link';
import { loadAll, formatDate } from '@/lib/data';
import { Shield } from '@/components/Shield';
import { Notices } from '@/components/Notices';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Assets' };

export default function AssetsPage() {
  const { coverage, usingSamples, inventory } = loadAll();
  return (
    <>
      <Notices usingSamples={usingSamples} issues={inventory.issues} />
      <div className="stack" style={{ ['--gap' as string]: '12px' }}>
        <h1>AI asset inventory</h1>
        <p className="lede">
          One YAML file per asset in <code>inventory/assets</code>. Describe what the system is and what it can do;
          Pertinax works out which risks apply.
        </p>
      </div>
      <div className="section table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Asset</th>
              <th>Owner</th>
              <th>Exposure</th>
              <th>Data</th>
              <th>Risks</th>
              <th>Breaches</th>
              <th>Last run</th>
            </tr>
          </thead>
          <tbody>
            {coverage.assets.map((a) => {
              const applicable = a.cells.filter((c) => c.status !== 'na');
              const breaches = applicable.filter((c) => c.status === 'breach').length;
              return (
                <tr key={a.asset.id}>
                  <td>
                    <Link href={`/assets/${a.asset.id}`} style={{ fontWeight: 600 }}>
                      {a.asset.name}
                    </Link>
                    <div className="small faint">{a.asset.kind}</div>
                  </td>
                  <td>{a.asset.owner}</td>
                  <td>{a.asset.exposure}</td>
                  <td>
                    {a.asset.data.classification}
                    {a.asset.data.personalData && <div className="small faint">personal data</div>}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', maxWidth: 260 }}>
                      {applicable.map((c) => (
                        <Shield key={c.risk.id} status={c.status} size="sm" title={`${c.risk.id} ${c.risk.name}: ${c.note}`} />
                      ))}
                    </div>
                  </td>
                  <td>{breaches || <span className="faint">0</span>}</td>
                  <td>
                    {a.latestRun ? formatDate(a.latestRun.startedAt) : <span className="faint">never</span>}
                    {a.stale && <div className="small" style={{ color: 'var(--review)' }}>due for re-test</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
