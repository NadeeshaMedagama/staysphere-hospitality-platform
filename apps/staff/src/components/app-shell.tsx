'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { cn } from '@staysphere/ui';
import type { Role } from '@staysphere/contracts';
import type { Workspace } from '@/lib/roles';

export interface StaffSessionView {
  readonly id: string;
  readonly name: string;
  readonly initials: string;
  readonly roles: readonly Role[];
  readonly hotelId: string;
  readonly hotelName: string;
}

export interface AppShellProps {
  readonly session: StaffSessionView;
  readonly workspaces: readonly Workspace[];
  /** Unread count for the alert badge; delivered over the real-time channel. */
  readonly unreadCount?: number;
  readonly children: ReactNode;
}

/**
 * The staff frame.
 *
 * Workspaces sit along the top rather than in a sidebar: staff use this on
 * tablets at a desk and on phones in a corridor, where a collapsing sidebar is
 * one more tap between someone and their next task.
 */
export function AppShell({ session, workspaces, unreadCount = 0, children }: AppShellProps) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-line bg-surface border-b">
        <div className="flex h-14 items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" className="flex shrink-0 items-center gap-2">
              <span
                aria-hidden="true"
                className="bg-brand-600 grid size-7 place-items-center rounded-md text-sm font-semibold text-white"
              >
                S
              </span>
              <span className="text-ink-900 hidden text-sm font-semibold sm:block">StaySphere</span>
            </Link>
            <span className="text-ink-500 truncate text-sm">{session.hotelName}</span>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <Link
              href="/notifications"
              aria-label={
                unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'
              }
              className="text-ink-700 hover:bg-canvas relative rounded-md px-2.5 py-1.5 text-sm transition-colors"
            >
              Alerts
              {unreadCount > 0 ? (
                <span
                  aria-hidden="true"
                  className="bg-negative absolute -right-0.5 -top-0.5 grid size-4 place-items-center rounded-full text-[0.625rem] font-semibold text-white"
                >
                  {unreadCount}
                </span>
              ) : null}
            </Link>
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="bg-brand-100 text-brand-700 grid size-7 place-items-center rounded-full text-xs font-semibold"
              >
                {session.initials}
              </span>
              <div className="hidden leading-tight sm:block">
                <p className="text-ink-900 text-sm">{session.name}</p>
                <p className="text-ink-400 text-[0.6875rem]">{session.roles.join(', ')}</p>
              </div>
            </div>
          </div>
        </div>

        <nav aria-label="Workspaces" className="overflow-x-auto px-4 sm:px-6">
          <ul className="flex gap-1">
            {workspaces.map((workspace) => {
              const active = pathname.startsWith(workspace.href);
              return (
                <li key={workspace.id}>
                  <Link
                    href={workspace.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      '-mb-px block whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors',
                      active
                        ? 'border-brand-600 text-brand-700 font-medium'
                        : 'text-ink-500 hover:text-ink-900 border-transparent',
                    )}
                  >
                    {workspace.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>

      <main className="flex-1 p-4 sm:p-6">{children}</main>
    </div>
  );
}
