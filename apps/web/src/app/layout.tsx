import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://staysphere.vercel.app'),
  title: {
    default: 'StaySphere — Find your perfect stay',
    template: '%s · StaySphere',
  },
  description:
    'Book rooms, suites and long stays across the StaySphere collection. Real-time availability, transparent pricing, no booking fees.',
  openGraph: {
    type: 'website',
    siteName: 'StaySphere',
    title: 'StaySphere — Find your perfect stay',
    description: 'Real-time availability and transparent pricing across the StaySphere collection.',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#35756d',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <a
          href="#main"
          className="focus:bg-brand-600 sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:px-4 focus:py-2 focus:text-white"
        >
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
