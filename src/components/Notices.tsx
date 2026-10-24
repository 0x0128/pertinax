import type { InventoryIssue } from '@/lib/inventory';

export function Notices({ usingSamples, issues }: { usingSamples: boolean; issues: InventoryIssue[] }) {
  return (
    <>
      {usingSamples && (
        <p className="notice">
          These results are synthetic samples from <code>examples/runs</code>. Start the demo bot and run{' '}
          <code>npm run pertinax -- run demo-bot</code> to replace them with your own.
        </p>
      )}
      {issues.length > 0 && (
        <div className="notice" role="alert">
          <strong>Some inventory files could not be read.</strong> Run <code>npm run validate</code> for details.
          <ul className="small">
            {issues.slice(0, 5).map((i, n) => (
              <li key={n}>
                {i.file}: {i.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
