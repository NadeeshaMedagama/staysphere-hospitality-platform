import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'StaySphere Staff', template: '%s · StaySphere Staff' },
  description: 'Reception, housekeeping, maintenance and finance workspaces.',
  robots: { index: false, follow: false, nocache: true },
};

export const viewport: Viewport = {
  themeColor: '#285c56',
  width: 'device-width',
  initialScale: 1,
};

/**
 * Only the document shell lives here. The workspace chrome belongs to the
 * `(workspace)` group, so the sign-in page can render without a workspace bar
 * that would be useless until someone is actually signed in.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
