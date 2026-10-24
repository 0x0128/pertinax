import Link from 'next/link';
import { loadAll } from '@/lib/data';
import { FRAMEWORK_LABEL, OWASP_AGENTIC, OWASP_LLM, promptfooMappingFor } from '@/lib/catalog';
import { STATUS_LABEL } from '@/lib/coverage';
import { Legend, Shield } from '@/components/Shield';
import { Notices } from '@/components/Notices';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Coverage by risk' };

export default function CoveragePage() {
  const { coverage, catalog, usingSamples, inventory } = loadAll();

  return (
    <>
      <Notices usingSamples={usingSamples} issues={inventory.issues} />
      <div className="stack" style={{ ['--gap' as string]: '12px' }}>
        <h1>Coverage by risk</h1>
        <p className="lede">
          Each OWASP risk, the assets it applies to, and what the latest evidence says. Promptfoo plugins listed under a
          risk are the tests Promptfoo itself maps to it.
        </p>
      </div>
      <Legend />

      {[
        { title: FRAMEWORK_LABEL['owasp-llm'], risks: OWASP_LLM },
        { title: FRAMEWORK_LABEL['owasp-agentic'], risks: OWASP_AGENTIC },
      ].map((group) => (
        <section className="section" key={group.title}>
          <div className="section-head">
            <h2>{group.title}</h2>
          </div>
          {group.risks.map((risk) => {
            const cells = coverage.assets
              .map((a) => ({ a, cell: a.cells.find((c) => c.risk.id === risk.id)! }))
              .filter(({ cell }) => cell.status !== 'na');
            const plugins = promptfooMappingFor(catalog, risk).plugins;
            const breaches = cells.filter(({ cell }) => cell.status === 'breach').length;
            return (
              <article key={risk.id} id={risk.id} className="risk-row" style={{ gridTemplateColumns: '70px minmax(0,1fr)' }}>
                <div className="id" style={{ paddingTop: 0 }}>
                  {risk.id}
                </div>
                <div className="stack" style={{ ['--gap' as string]: '10px' }}>
                  <div>
                    <h3>{risk.name}</h3>
                    <p className="muted small" style={{ marginTop: 4 }}>
                      {risk.summary}
                    </p>
                  </div>
                  {cells.length === 0 ? (
                    <p className="small faint">Does not apply to any asset in the inventory.</p>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 22px' }}>
                      {cells.map(({ a, cell }) => (
                        <Link
                          key={a.asset.id}
                          href={`/assets/${a.asset.id}#${risk.id}`}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}
                          title={cell.note}
                        >
                          <Shield status={cell.status} size="sm" stale={cell.stale} />
                          <span className="small">
                            {a.asset.name} <span className="faint">{STATUS_LABEL[cell.status].toLowerCase()}</span>
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                  <p className="small faint">
                    {plugins.length
                      ? `Promptfoo tests: ${plugins.join(', ')}`
                      : 'Promptfoo has no automated test for this risk. Record manual evidence per asset.'}
                    {breaches > 0 && ` · breached on ${breaches} ${breaches === 1 ? 'asset' : 'assets'}`}
                  </p>
                </div>
              </article>
            );
          })}
        </section>
      ))}
    </>
  );
}
