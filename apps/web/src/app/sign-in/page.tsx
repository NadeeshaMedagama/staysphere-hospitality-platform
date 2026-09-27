import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageShell } from '@/components/page-shell';
import { getSession } from '@/lib/session';
import { SignInForm } from './sign-in-form';

export const metadata: Metadata = { title: 'Sign in', robots: { index: false, follow: false } };

/**
 * Credentials must never be rendered from a cached page, and the session cookie
 * makes the output per-visitor regardless.
 */
export const dynamic = 'force-dynamic';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const [session, { next }] = await Promise.all([getSession(), searchParams]);

  // Already signed in: send them where they were headed instead of showing a
  // form that would only replace the session they already have.
  if (session) redirect('/bookings');

  return (
    <PageShell
      eyebrow="Account"
      title="Sign in"
      lede="Access your reservations, amend a stay or review a folio."
    >
      <SignInForm next={next} />
      <p className="text-ink-500 mt-6 text-center text-sm">
        New here?{' '}
        <Link href="/bookings" className="text-brand-600 hover:text-brand-700">
          Look up a booking instead
        </Link>
      </p>
    </PageShell>
  );
}
