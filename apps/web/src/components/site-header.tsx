import Link from 'next/link';
import { signOutAction } from '@/app/sign-in/actions';
import { getSession } from '@/lib/session';

const NAV = [
  { href: '/rooms', label: 'Rooms & Suites' },
  { href: '/amenities', label: 'Amenities' },
  { href: '/offers', label: 'Offers' },
  { href: '/contact', label: 'Contact' },
] as const;

/** First letter of each of the first two words, e.g. "Test Guest" → "TG". */
function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || '?';
}

export async function SiteHeader() {
  const session = await getSession();

  return (
    <header className="border-sand-200/80 bg-sand-50/85 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="bg-brand-600 font-display grid size-8 place-items-center rounded-lg text-base text-white"
          >
            S
          </span>
          <span className="font-display text-ink-900 text-xl tracking-tight">StaySphere</span>
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-7 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-ink-700 hover:text-brand-600 text-sm transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/bookings"
            className="text-ink-700 hover:text-brand-600 hidden text-sm transition-colors sm:block"
          >
            My bookings
          </Link>

          {session ? (
            <div className="flex items-center gap-2.5">
              <span
                className="bg-brand-100 text-brand-700 grid size-8 place-items-center rounded-full text-xs font-semibold"
                title={session.user.email}
              >
                {initials(session.user.fullName)}
              </span>
              {/* A sign-out that is a GET link can be triggered by any image tag
                  on any site the guest visits. A form POST to a server action
                  cannot be, and Next verifies the action's origin. */}
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="text-ink-700 hover:text-brand-600 text-sm transition-colors"
                >
                  Sign out
                </button>
              </form>
            </div>
          ) : (
            <Link
              href="/sign-in"
              className="bg-brand-600 hover:bg-brand-700 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
