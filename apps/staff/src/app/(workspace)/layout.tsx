import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { workspacesFor } from '@/lib/roles';
import { initialsOf, requireSession } from '@/lib/session';
import { resolveHotel } from '@/lib/hotel';
import { unreadCount } from '@/lib/data';

/**
 * The signed-in staff app.
 *
 * Every workspace is gated here rather than page by page: a workspace added
 * later is protected by existing in the group, which is the opposite of the
 * usual failure mode where a new screen quietly ships without a check.
 */
export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  const hotel = await resolveHotel(session);
  const unread = await unreadCount(session.accessToken);

  return (
    <AppShell
      session={{
        id: session.user.id,
        name: session.user.fullName,
        initials: initialsOf(session.user.fullName),
        roles: session.user.roles,
        hotelId: hotel?.id ?? '',
        hotelName: hotel ? `${hotel.name} · ${hotel.city}` : 'No property assigned',
      }}
      workspaces={workspacesFor(session.user.roles)}
      unreadCount={unread}
    >
      {children}
    </AppShell>
  );
}
