import type { Metadata } from 'next';
import { formatMoney, money } from '@staysphere/contracts';
import { Badge, DataTable, PageHeader, StatCard, StatusBadge, type Column } from '@staysphere/ui';
import { RowAction, RowActionWithNote } from '@/components/row-action';
import { SectionFailure } from '@/components/section-state';
import {
  resolveMaintenanceTicket,
  startMaintenanceTicket,
  takeMaintenanceTicket,
} from '@/app/actions';
import { maintenanceTickets, type MaintenanceTicket, type Scope } from '@/lib/data';
import { resolveHotel } from '@/lib/hotel';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Maintenance' };
export const dynamic = 'force-dynamic';

const DATE_TIME = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function due(iso: string | null): string {
  if (!iso) return '—';
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? '—' : DATE_TIME.format(parsed);
}

const columns: ReadonlyArray<Column<MaintenanceTicket>> = [
  {
    key: 'where',
    header: 'Location',
    render: (row) => (
      <span className="text-ink-900 font-medium">{row.roomNumber ?? row.location ?? '—'}</span>
    ),
  },
  { key: 'summary', header: 'Issue', render: (row) => row.summary },
  { key: 'priority', header: 'Priority', render: (row) => <StatusBadge status={row.priority} /> },
  { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
  {
    key: 'offline',
    header: 'Offline',
    hideOnMobile: true,
    render: (row) => (row.takesRoomOffline ? <Badge tone="negative">Room offline</Badge> : '—'),
  },
  {
    key: 'assignee',
    header: 'Assigned to',
    render: (row) => row.assignedToName ?? <span className="text-caution">Unassigned</span>,
  },
  { key: 'due', header: 'Due', numeric: true, render: (row) => due(row.dueAt) },
  {
    key: 'action',
    header: '',
    className: 'text-right',
    render: (row) => <TicketAction ticket={row} />,
  },
];

function TicketAction({ ticket }: { ticket: MaintenanceTicket }) {
  if (ticket.status === 'REPORTED') {
    return <RowAction action={takeMaintenanceTicket} id={ticket.id} label="Take" />;
  }
  if (ticket.status === 'ASSIGNED') {
    return <RowAction action={startMaintenanceTicket} id={ticket.id} label="Start" />;
  }
  if (ticket.status === 'IN_PROGRESS') {
    return (
      <RowActionWithNote
        action={resolveMaintenanceTicket}
        id={ticket.id}
        label="Resolve"
        field="resolutionNotes"
        placeholder="What fixed it?"
      />
    );
  }
  return <span className="text-ink-400 text-xs">Closed</span>;
}

export default async function MaintenancePage() {
  const session = await requireSession();
  const hotel = await resolveHotel(session);

  if (!hotel) {
    return <PageHeader title="Maintenance" description="No property is attached to this account." />;
  }

  const scope: Scope = { hotelId: hotel.id, accessToken: session.accessToken };
  const result = await maintenanceTickets(scope, { pageSize: 100 });

  if (!result.ok) {
    return (
      <div className="space-y-5">
        <PageHeader title="Maintenance" description="Engineering tickets by priority." />
        <SectionFailure failure={result} service="The maintenance service" />
      </div>
    );
  }

  const tickets = result.data;
  const open = tickets.filter((t) => t.status !== 'CLOSED' && t.status !== 'RESOLVED');
  const offline = open.filter((t) => t.takesRoomOffline).length;
  // Only tickets that actually recorded a cost carry a currency, and adding
  // amounts across different currencies would produce a meaningless total.
  const currency = tickets.find((ticket) => ticket.currency)?.currency ?? hotel.currency;
  const cost = tickets
    .filter((ticket) => ticket.currency === currency)
    .reduce((total, ticket) => total + ticket.costMinor, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Maintenance"
        description="Engineering tickets by priority and time to breach."
        meta={<span className="text-ink-400 text-xs">{hotel.name}</span>}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Open tickets" value={String(open.length)} caption="Awaiting resolution" />
        <StatCard label="Rooms offline" value={String(offline)} caption="Not sellable" invertDelta />
        <StatCard label="Recorded cost" value={formatMoney(money(cost, currency))} caption="All tickets" />
      </div>

      <section className="rounded-card border-line bg-surface border">
        <header className="border-line border-b px-4 py-3">
          <h2 className="text-ink-900 text-sm font-semibold">Tickets</h2>
        </header>
        <DataTable
          columns={columns}
          rows={tickets}
          rowKey={(row) => row.id}
          caption="Maintenance tickets"
          emptyTitle="Nothing outstanding"
          emptyDescription="Tickets raised by any department appear here."
        />
      </section>
    </div>
  );
}
