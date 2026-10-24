import Link from 'next/link';
import type { OpenFinding } from '@/lib/coverage';
import { pluginLabel } from '@/lib/catalog';
import { formatDate } from '@/lib/data';

export function FindingList({ findings, showAsset = true }: { findings: OpenFinding[]; showAsset?: boolean }) {
  if (findings.length === 0) return <p className="muted">No open findings.</p>;
  return (
    <div>
      {findings.map((f) => (
        <details key={`${f.assetId}-${f.id}`} className="finding">
          <summary>
            <span className={`sev ${f.severity}`}>{f.severity}</span>
            <span>
              <b>{pluginLabel(f.pluginId)}</b>
              {f.strategyId !== 'basic' && <span className="muted"> via {f.strategyId}</span>}
              {showAsset && (
                <span className="muted">
                  {' '}
                  on <Link href={`/assets/${f.assetId}`}>{f.assetId}</Link>
                </span>
              )}
              <div className="small faint">{f.reason}</div>
            </span>
            <span className="small">
              {f.risks.map((r) => (
                <Link key={r} href={`/coverage#${r}`} className="tag">
                  {r}
                </Link>
              ))}
              {f.techniques.map((t) => (
                <a key={t} href={`https://atlas.mitre.org/techniques/${t}`} target="_blank" rel="noreferrer" className="tag">
                  {t}
                </a>
              ))}
            </span>
          </summary>
          <div className="exchange">
            <div>
              <div className="small faint">Attack sent</div>
              <pre>{f.attack || '(empty)'}</pre>
            </div>
            <div>
              <div className="small faint">Response</div>
              <pre>{f.output || '(empty)'}</pre>
            </div>
            <p className="small faint" style={{ gridColumn: '1 / -1' }}>
              Found {formatDate(f.foundAt)} in run {f.runId}
              {f.sample && ' (synthetic sample)'}
              {f.tactics.length > 0 && `. ATLAS tactics: ${f.tactics.join(', ')}`}
            </p>
          </div>
        </details>
      ))}
    </div>
  );
}
