import type { ReactNode } from 'react';
import { Sidebar } from '@/components/sidebar';
import { Topbar } from '@/components/topbar';
import { requireSession } from '@/lib/session';

/**
 * The signed-in console.
 *
 * Every page in this group is gated here rather than page by page: a section
 * added later is protected by existing in the group, which is the opposite of
 * the usual failure mode where a new screen quietly ships without a check.
 */
export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={session.user} />
        <main className="flex-1 p-5">{children}</main>
      </div>
    </div>
  );
}
