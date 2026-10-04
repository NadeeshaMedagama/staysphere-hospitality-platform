import { humaniseStatus } from '@staysphere/ui';
import type { SessionUser } from '@staysphere/app-core';
import { signOutAction } from '@/app/sign-in/actions';

/** First letter of each of the first two words, e.g. "Duty Manager" → "DM". */
function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || '?';
}

/** The most senior role reads best as the person's title. */
function primaryRole(roles: readonly string[]): string {
  return roles[0] ? humaniseStatus(roles[0]) : 'Staff';
}

export function Topbar({ user }: { user: SessionUser }) {
  return (
    <header className="border-line flex h-14 items-center justify-between border-b bg-white px-5">
      <div className="flex items-center gap-3">
        <p className="text-ink-900 text-sm font-medium">
          {user.hotelId ? 'Seaside Grand · Colombo' : 'All properties'}
        </p>
        <span className="border-line text-ink-500 rounded-md border px-2 py-0.5 text-[0.6875rem]">
          {user.hotelId ? 'Property scope' : 'Platform scope'}
        </span>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="bg-brand-100 text-brand-700 grid size-7 place-items-center rounded-full text-xs font-semibold"
          >
            {initials(user.fullName)}
          </span>
          <div className="leading-tight">
            <p className="text-ink-900 text-sm">{user.fullName}</p>
            <p className="text-ink-400 text-[0.6875rem]">{primaryRole(user.roles)}</p>
          </div>
        </div>
        {/* A sign-out that is a GET link can be triggered by any image tag on
            any page a member of staff opens. A form POST to a server action
            cannot be, and Next verifies the action's origin. */}
        <form action={signOutAction} className="border-line border-l pl-4">
          <button
            type="submit"
            className="text-ink-700 hover:bg-slate-25 rounded-md px-2.5 py-1.5 text-sm transition-colors"
          >
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
