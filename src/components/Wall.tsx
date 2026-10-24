import Link from 'next/link';
import type { AssetCoverage } from '@/lib/coverage';
import { OWASP_AGENTIC, OWASP_LLM, type Risk } from '@/lib/catalog/owasp';
import { Shield } from './Shield';

/**
 * The shield wall: one row per asset, one shield per risk. Red shields are breaches,
 * hatched shields are gaps. Hover a shield for the reason; click to open the asset.
 */
export function Wall({ assets, groups = ['llm', 'agentic'] }: { assets: AssetCoverage[]; groups?: ('llm' | 'agentic')[] }) {
  const cols: { title: string; risks: Risk[] }[] = [];
  if (groups.includes('llm')) cols.push({ title: 'OWASP LLM Top 10', risks: OWASP_LLM });
  if (groups.includes('agentic')) cols.push({ title: 'OWASP Agentic Top 10', risks: OWASP_AGENTIC });

  return (
    <div className="wall-scroll">
      <table className="wall">
        <thead>
          <tr>
            <th />
            {cols.map((c, i) => (
              <Group key={c.title} span={c.risks.length} title={c.title} gap={i > 0} />
            ))}
          </tr>
          <tr>
            <th className="asset-head" scope="col">
              <span className="faint">Asset</span>
            </th>
            {cols.map((c, i) => [
              i > 0 ? <th key={`gap-${c.title}`} className="gap-col" /> : null,
              ...c.risks.map((r) => (
                <th key={r.id} className="risk-head" scope="col">
                  <Link href={`/coverage#${r.id}`} title={r.summary}>
                    <b>{r.id}</b> {r.name}
                  </Link>
                </th>
              )),
            ])}
          </tr>
        </thead>
        <tbody>
          {assets.map((a) => (
            <tr key={a.asset.id}>
              <th className="asset-head" scope="row">
                <Link href={`/assets/${a.asset.id}`}>{a.asset.name}</Link>
                <span className="small faint">
                  {a.asset.kind}, {a.asset.exposure}
                </span>
              </th>
              {cols.map((c, i) => [
                i > 0 ? <td key={`gap-${c.title}`} className="gap-col" /> : null,
                ...c.risks.map((r) => {
                  const cell = a.cells.find((x) => x.risk.id === r.id)!;
                  return (
                    <td key={r.id}>
                      <Shield
                        status={cell.status}
                        stale={cell.stale && cell.status !== 'na'}
                        count={cell.status === 'breach' ? cell.findings : undefined}
                        href={`/assets/${a.asset.id}#${r.id}`}
                        title={`${a.asset.name} · ${r.id} ${r.name}\n${cell.note}`}
                      />
                    </td>
                  );
                }),
              ])}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Group({ span, title, gap }: { span: number; title: string; gap: boolean }) {
  return (
    <>
      {gap && <th className="gap-col" />}
      <th colSpan={span} className="group-head">
        {title}
      </th>
    </>
  );
}
