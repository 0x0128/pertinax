import Link from 'next/link';
import { STATUS_LABEL, type CellStatus } from '@/lib/coverage';

export function Shield({
  status,
  title,
  href,
  count,
  stale,
  size,
}: {
  status: CellStatus;
  title?: string;
  href?: string;
  count?: number;
  stale?: boolean;
  size?: 'sm';
}) {
  const className = ['shield', status, stale ? 'stale' : '', size ?? ''].filter(Boolean).join(' ');
  const label = title ?? STATUS_LABEL[status];
  const inner = count && size !== 'sm' ? <span className="count">{count}</span> : null;
  return href ? (
    <Link href={href} className={className} title={label} aria-label={label}>
      {inner}
    </Link>
  ) : (
    <span className={className} title={label} role="img" aria-label={label}>
      {inner}
    </span>
  );
}

const ORDER: CellStatus[] = ['breach', 'holding', 'partial', 'untested', 'review', 'covered', 'na'];

export function Legend({ showStale = true }: { showStale?: boolean }) {
  return (
    <ul className="legend">
      {ORDER.map((s) => (
        <li key={s}>
          <Shield status={s} size="sm" /> {STATUS_LABEL[s]}
        </li>
      ))}
      {showStale && (
        <li>
          <Shield status="holding" size="sm" stale /> Evidence older than the asset’s re-test cadence
        </li>
      )}
    </ul>
  );
}
