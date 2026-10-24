import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadAll, formatDate } from '@/lib/data';
import { STATUS_LABEL } from '@/lib/coverage';
import { Shield } from '@/components/Shield';
import { FindingList } from '@/components/FindingList';
import { Notices } from '@/components/Notices';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: id };
}

export default async function AssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { coverage, usingSamples, inventory } = loadAll();
  const cov = coverage.assets.find((a) => a.asset.id === id);
  if (!cov) notFound();
  const { asset, plan, cells, runs, openFindings } = cov;
  const applicable = cells.filter((c) => c.status !== 'na');
  const notApplicable = cells.filter((c) => c.status === 'na');
  const breaches = applicable.filter((c) => c.status === 'breach').length;
  const tools = asset.capabilities.tools;

  return (
    <>
      <Notices usingSamples={usingSamples} issues={inventory.issues} />
      <p className="small">
        <Link href="/assets">Assets</Link>
      </p>
      <div className="stack" style={{ ['--gap' as string]: '12px', marginTop: 8 }}>
        <h1>{asset.name}</h1>
        {asset.description && <p className="lede">{asset.description}</p>}
      </div>

      <dl className="meta-grid section" style={{ marginTop: 32 }}>
        <Meta label="Kind" value={asset.kind} />
        <Meta label="Owner" value={asset.owner} />
        <Meta label="Exposure" value={`${asset.exposure}, ${asset.environment}`} />
        <Meta label="Data" value={`${asset.data.classification}${asset.data.personalData ? ', personal data' : ''}`} />
        <Meta label="Model" value={asset.model ? `${asset.model.provider} ${asset.model.name} (${asset.model.hosting})` : 'not recorded'} />
        <Meta label="Autonomy" value={asset.capabilities.autonomy} />
        <Meta
          label="Capabilities"
          value={
            Object.entries(asset.capabilities)
              .filter(([k, v]) => v === true && k !== 'tools')
              .map(([k]) => k)
              .join(', ') || 'none'
          }
        />
        <Meta label="Re-test every" value={`${asset.testing.cadenceDays} days`} />
      </dl>

      {tools.length > 0 && (
        <p className="small muted" style={{ marginTop: 16 }}>
          Tools:{' '}
          {tools.map((t) => (
            <span key={t.name} className="tag" title={t.description}>
              {t.name} ({t.access}
              {t.source !== 'internal' ? `, ${t.source}` : ''})
            </span>
          ))}
        </p>
      )}

      <section className="section">
        <div className="section-head">
          <h2>
            {breaches > 0 ? `${breaches} of ${applicable.length} risks breached` : `${applicable.length} risks apply`}
          </h2>
          <span className="small muted">
            {cov.latestRun ? `Last run ${formatDate(cov.latestRun.startedAt)}${cov.stale ? ', due for re-test' : ''}` : 'Never tested'}
          </span>
        </div>
        {applicable.map((c) => (
          <div key={c.risk.id} id={c.risk.id} className="risk-row">
            <Shield status={c.status} stale={c.stale} title={STATUS_LABEL[c.status]} />
            <span className="id">{c.risk.id}</span>
            <span className="name">
              <b>{c.risk.name}</b> <span className="muted">· {STATUS_LABEL[c.status]}</span>
            </span>
            <div className="detail stack" style={{ ['--gap' as string]: '4px' }}>
              <p>
                <span className="faint">Why it applies: </span>
                {c.applicability.reason.replace(/\.$/, "")}.
              </p>
              <p>{c.note}</p>
              {c.planned.length > 0 && <p className="small faint">Tests: {c.planned.join(', ')}</p>}
              {c.skipped.length > 0 && (
                <p className="small faint">Left out: {c.skipped.map((s) => `${s.id} (${s.reason})`).join('; ')}</p>
              )}
              {c.applicability.decision?.evidence && <p className="small faint">Evidence: {c.applicability.decision.evidence}</p>}
            </div>
          </div>
        ))}
        {notApplicable.length > 0 && (
          <details style={{ marginTop: 16 }}>
            <summary className="small muted" style={{ cursor: 'pointer' }}>
              {notApplicable.length} risks do not apply
            </summary>
            {notApplicable.map((c) => (
              <div key={c.risk.id} id={c.risk.id} className="risk-row">
                <Shield status="na" />
                <span className="id">{c.risk.id}</span>
                <span className="name muted">{c.risk.name}</span>
                <p className="detail small">{c.note}</p>
              </div>
            ))}
          </details>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Open findings</h2>
          <span className="small muted">{openFindings.length}</span>
        </div>
        <FindingList findings={openFindings} showAsset={false} />
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Run the red team</h2>
        </div>
        {asset.target ? (
          <div className="stack">
            <p className="muted">
              {plan.plugins.length} Promptfoo plugins, strategies {plan.strategies.join(', ')}, {plan.numTests}{' '}
              {plan.numTests === 1 ? 'test' : 'tests'} per plugin.
            </p>
            <pre className="command">
              <code>{`npm run pertinax -- plan ${asset.id}   # see what will run and why\nnpm run pertinax -- run ${asset.id}    # generate, attack, record`}</code>
            </pre>
          </div>
        ) : (
          <p className="muted">
            This asset has no <code>target</code> yet, so it can be planned but not attacked. Add a Promptfoo target to{' '}
            <code>inventory/assets/{asset.id}.yaml</code>.
          </p>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Run history</h2>
        </div>
        {runs.length === 0 ? (
          <p className="muted">No runs yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Attacks</th>
                <th>Got through</th>
                <th>Errors</th>
                <th>Plugins</th>
              </tr>
            </thead>
            <tbody>
              {[...runs].reverse().map((r) => (
                <tr key={r.id}>
                  <td>
                    {formatDate(r.startedAt)}
                    {r.sample && <div className="small faint">synthetic sample</div>}
                  </td>
                  <td>{r.stats.total}</td>
                  <td>{r.stats.failed}</td>
                  <td>{r.stats.errors}</td>
                  <td className="small muted">{Object.keys(r.plugins).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
