'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Overview' },
  { href: '/coverage', label: 'Coverage' },
  { href: '/atlas', label: 'ATLAS' },
  { href: '/assets', label: 'Assets' },
  { href: '/findings', label: 'Findings' },
  { href: '/catalog', label: 'Tests' },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Main">
      {LINKS.map((l) => {
        const active = l.href === '/' ? path === '/' : path.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} aria-current={active ? 'page' : undefined}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Nine shields locked into a testudo. */
export function Mark({ size = 22 }: { size?: number }) {
  const cells = [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => ({ r, c })));
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {cells.map(({ r, c }) => (
        <rect key={`${r}${c}`} x={c * 8 + 0.5} y={r * 8 + 0.5} width={7} height={7} rx={1.2} ry={2.6} fill="currentColor" />
      ))}
    </svg>
  );
}
