import type { Metadata } from 'next';
import { Badge, Card, EmptyState, PageHeader, cn, formatRelative } from '@staysphere/ui';
import { SectionFailure } from '@/components/section-state';
import { notifications, type Notification } from '@/lib/data';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Notifications' };
export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const session = await requireSession();
  const result = await notifications(session.accessToken);

  if (!result.ok) {
    return (
      <div className="space-y-5">
        <PageHeader title="Alerts" description="What happened while you were working." />
        <SectionFailure failure={result} service="The notification service" />
      </div>
    );
  }

  const items = result.data;
  const unread = items.filter((item) => !item.readAt).length;
  // Fixed once per render so every row is relative to the same instant.
  const now = new Date();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Alerts"
        description="What happened while you were working."
        meta={
          unread > 0 ? (
            <Badge tone="brand">{unread} unread</Badge>
          ) : (
            <span className="text-ink-400 text-xs">All caught up</span>
          )
        }
      />

      {items.length === 0 ? (
        <EmptyState
          title="Nothing to catch up on"
          description="Room-ready, escalation and shift alerts arrive here as they are raised."
        />
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <NotificationCard item={item} now={now} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NotificationCard({ item, now }: { item: Notification; now: Date }) {
  const unread = !item.readAt;

  return (
    <Card
      className={cn(
        'px-4 py-3',
        // Unread is marked with a border as well as weight: colour alone is not
        // a reliable signal on a washed-out corridor tablet.
        unread && 'border-brand-500/40 bg-brand-50/40',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn('text-ink-900 text-sm', unread && 'font-semibold')}>{item.title}</p>
          <p className="text-ink-500 mt-0.5 text-sm">{item.body}</p>
        </div>
        <span className="text-ink-400 shrink-0 text-xs">{formatRelative(item.createdAt, now)}</span>
      </div>
    </Card>
  );
}
