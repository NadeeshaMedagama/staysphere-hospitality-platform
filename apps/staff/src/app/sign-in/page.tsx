import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { SignInForm } from './sign-in-form';

export const metadata: Metadata = { title: 'Sign in' };

// Credentials must never render from a cached page, and the session cookie
// makes the output per-visitor regardless.
export const dynamic = 'force-dynamic';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const [session, { next }] = await Promise.all([getSession(), searchParams]);

  if (session) redirect('/');

  return (
    <div className="bg-canvas grid min-h-screen place-items-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="bg-brand-600 grid size-8 place-items-center rounded-md text-sm font-semibold text-white"
          >
            S
          </span>
          <div className="leading-tight">
            <p className="text-ink-900 text-base font-semibold">StaySphere</p>
            <p className="text-ink-400 text-xs">Staff workspaces</p>
          </div>
        </div>

        <h1 className="text-ink-900 mt-8 text-xl font-semibold">Sign in</h1>
        <p className="text-ink-500 mt-1 text-sm">
          Use the work account issued to you by your property administrator.
        </p>

        <div className="rounded-card border-line mt-6 border bg-white p-6">
          <SignInForm next={next} />
        </div>

        <p className="text-ink-400 mt-6 text-xs leading-relaxed">
          This app is for hotel staff. Guest accounts should use the booking site to manage a
          reservation.
        </p>
      </div>
    </div>
  );
}
