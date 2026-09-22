import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'StaySphere Operations', template: '%s · StaySphere Operations' },
  description: 'Reservations, housekeeping, maintenance and revenue for the StaySphere collection.',
  // A staff console must never be indexed.
  robots: { index: false, follow: false, nocache: true },
};

export const viewport: Viewport = {
  themeColor: '#285c56',
  width: 'device-width',
  initialScale: 1,
};

/**
 * Only the document shell lives here. The console chrome — sidebar, topbar —
 * belongs to the `(console)` group, so the sign-in page can render without a
 * navigation frame that would be useless until someone is actually signed in.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
