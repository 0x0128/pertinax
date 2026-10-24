import { loadAll } from '@/lib/data';
import { pluginLabel, risksForPlugin, tacticsFor, techniquesFor } from '@/lib/catalog';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Tests' };

export default function CatalogPage() {
  const { catalog, coverage } = loadAll();
  const tacticName = new Map(catalog.atlas.tactics.map((t) => [t.id, t.name]));

  // Every plugin that appears in at least one framework mapping, plus anything planned.
  const mapped = new Set<string>();
  for (const fw of Object.values(catalog.promptfoo.frameworks)) for (const m of Object.values(fw)) m.plugins.forEach((p) => mapped.add(p));
  coverage.assets.forEach((a) => a.plan.plugins.forEach((p) => mapped.add(p.id)));
  const rows = [...mapped].sort().map((id) => ({
    id,
    info: catalog.promptfoo.plugins[id],
    risks: risksForPlugin(catalog, id),
    tactics: tacticsFor(catalog, id),
    techniques: techniquesFor(catalog, id),
    usedBy: coverage.assets.filter((a) => a.plan.plugins.some((p) => p.id === id)).map((a) => a.asset.id),
  }));

  return (
    <>
      <div className="stack" style={{ ['--gap' as string]: '12px' }}>
        <h1>Tests and what they prove</h1>
        <p className="lede">
          The Promptfoo plugins Pertinax can schedule, with the OWASP risks and ATLAS tactics Promptfoo maps them to and the
          techniques from the Pertinax map.
        </p>
        <p className="small muted">
          Mappings from Promptfoo {catalog.promptfoo.promptfooVersion}, ATLAS {catalog.atlas.version}. Refresh with{' '}
          <code>npm run sync:promptfoo</code> and <code>npm run sync:atlas</code>.
        </p>
      </div>
      <div className="section table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Plugin</th>
              <th>OWASP</th>
              <th>ATLAS tactics</th>
              <th>ATLAS techniques</th>
              <th>Planned on</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} id={r.id}>
                <td style={{ minWidth: 220 }}>
                  <b>{pluginLabel(r.id)}</b>
                  <div className="small faint">
                    <code>{r.id}</code>
                    {r.info?.remoteOnly && ', needs remote generation'}
                  </div>
                  {r.info && <div className="small muted">{r.info.description}</div>}
                </td>
                <td className="small">{r.risks.join(', ') || <span className="faint">none</span>}</td>
                <td className="small">{r.tactics.map((t) => tacticName.get(t) ?? t).join(', ') || <span className="faint">none</span>}</td>
                <td className="small">
                  {r.techniques.map((t) => (
                    <a key={t} href={`https://atlas.mitre.org/techniques/${t}`} target="_blank" rel="noreferrer" className="tag">
                      {t}
                    </a>
                  ))}
                </td>
                <td className="small muted">{r.usedBy.length ? `${r.usedBy.length} assets` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
