import type { Metadata } from 'next';
import Link from 'next/link';
import { Mark, Nav } from '@/components/Nav';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Pertinax', template: '%s · Pertinax' },
  description: 'AI asset inventory and red-team coverage for Promptfoo, mapped to OWASP and MITRE ATLAS.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <div className="topbar-inner">
            <Link href="/" className="brand">
              <Mark /> Pertinax
            </Link>
            <Nav />
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
