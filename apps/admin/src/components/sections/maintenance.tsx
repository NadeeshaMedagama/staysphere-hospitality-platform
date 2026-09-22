import { Badge, DataTable, StatCard, StatusBadge, type Column } from '@staysphere/ui';
import { maintenanceTickets, type MaintenanceTicket, type Scope } from '@/lib/data';
import { SectionFailure } from '@/components/section-state';
import { minor, shortDateTime } from './shared';

const COLUMNS: ReadonlyArray<Column<MaintenanceTicket>> = [
  {
    key: 'where',
    header: 'Location',
    render: (row) => row.roomNumber ?? row.location ?? '—',
  },
  { key: 'summary', header: 'Issue', render: (row) => row.summary },
  { key: 'category', header: 'Category', hideOnMobile: true, render: (row) => <StatusBadge status={row.category} /> },
  { key: 'priority', header: 'Priority', render: (row) => <StatusBadge status={row.priority} /> },
  { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
  {
    key: 'offline',
    header: 'Room offline',
    hideOnMobile: true,
    render: (row) => (row.takesRoomOffline ? <Badge tone="negative">Yes</Badge> : '—'),
  },
  { key: 'due', header: 'Due', hideOnMobile: true, render: (row) => shortDateTime(row.dueAt) },
  {
    key: 'cost',
    header: 'Cost',
    numeric: true,
    render: (row) => minor(row.costMinor, row.currency),
  },
];

export async function MaintenanceSection({ scope }: { scope: Scope }) {
  const result = await maintenanceTickets(scope, { pageSize: 100 });
  if (!result.ok) return <SectionFailure failure={result} service="The maintenance service" />;

  const tickets = result.data;
  const open = tickets.filter((t) => t.status !== 'CLOSED' && t.status !== 'RESOLVED');
  const offline = tickets.filter((t) => t.takesRoomOffline && t.status !== 'CLOSED');

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Open tickets" value={String(open.length)} caption="Awaiting resolution" />
        <StatCard
          label="Rooms offline"
          value={String(offline.length)}
          caption="Not sellable while open"
          invertDelta
        />
        <StatCard label="All tickets" value={String(tickets.length)} caption="Across the property" />
      </div>

      <div className="rounded-card border-line border bg-white">
        <DataTable
          columns={COLUMNS}
          rows={tickets}
          rowKey={(row) => row.id}
          caption="Maintenance tickets"
          emptyTitle="Nothing outstanding"
          emptyDescription="Engineering tickets raised by any department appear here."
        />
      </div>
    </div>
  );
}
