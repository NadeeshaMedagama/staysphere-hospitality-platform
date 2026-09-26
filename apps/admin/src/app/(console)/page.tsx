import { Suspense } from 'react';
import { Alert, DataTable, PageHeader, StatCard, StatusBadge, TableSkeleton, type Column } from '@staysphere/ui';
import { RoomBoard } from '@/components/room-board';
import { SectionFailure } from '@/components/section-state';
import {
  dailySummary,
  housekeepingTasks,
  listBookings,
  maintenanceTickets,
  performance,
  roomBoard,
  type Scope,
} from '@/lib/data';
import { daysBefore, resolveHotel, todayAt } from '@/lib/hotel';
import { requireSession } from '@/lib/session';
import { minor, shortDateTime } from '@/components/sections/shared';

/** One row of the combined open-work queue, whatever team raised it. */
interface TaskRow {
  readonly id: string;
  readonly reference: string;
  readonly label: string;
  readonly team: string;
  readonly owner: string | null;
  readonly due: string | null;
  readonly status: string;
}

const TASK_COLUMNS: ReadonlyArray<Column<TaskRow>> = [
  {
    key: 'reference',
    header: 'Reference',
    render: (row) => <span className="text-ink-500 font-mono text-xs">{row.reference}</span>,
  },
  { key: 'label', header: 'Task', render: (row) => <span className="text-ink-900">{row.label}</span> },
  { key: 'team', header: 'Team', hideOnMobile: true, render: (row) => row.team },
  {
    key: 'owner',
    header: 'Owner',
    render: (row) => row.owner ?? <span className="text-caution">Unassigned</span>,
  },
  { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
  { key: 'due', header: 'Due', hideOnMobile: true, render: (row) => shortDateTime(row.due) },
];

export default async function OverviewPage() {
  const session = await requireSession();
  const hotel = await resolveHotel(session);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Today at a glance"
        description="Live figures, read from the booking, inventory and reporting services."
        meta={hotel ? <span className="text-ink-400 text-xs">{hotel.name}</span> : null}
      />

      {hotel ? (
        <Suspense fallback={<TableSkeleton columns={6} />}>
          <Overview
            scope={{ hotelId: hotel.id, accessToken: session.accessToken }}
            timezone={hotel.timezone}
          />
        </Suspense>
      ) : (
        <Alert tone="negative" title="No property is available">
          The hotel service could not be reached, or this account is not attached to a property.
        </Alert>
      )}
    </div>
  );
}

async function Overview({ scope, timezone }: { scope: Scope; timezone: string }) {
  const today = todayAt(timezone);

  const [summaryResult, perfResult, boardResult, tasksResult, ticketsResult, arrivalsResult] =
    await Promise.all([
      dailySummary(scope),
      performance(scope, daysBefore(timezone, 30), today),
      roomBoard(scope),
      housekeepingTasks(scope, { pageSize: 100 }),
      maintenanceTickets(scope, { pageSize: 100 }),
      listBookings(scope, { from: today, to: today, pageSize: 100 }),
    ]);

  const summary = summaryResult.ok ? summaryResult.data : null;
  const currency = summary?.currency ?? 'USD';

  // Housekeeping and maintenance are separate services with separate queues,
  // but a duty manager works one list. They are merged and sorted by what is
  // due soonest, with undated work last.
  const openTasks: TaskRow[] = [
    ...(tasksResult.ok
      ? tasksResult.data
          .filter((task) => task.status !== 'VERIFIED' && task.status !== 'COMPLETED')
          .map((task) => ({
            id: `hk-${task.id}`,
            reference: `HK-${task.id.slice(-6).toUpperCase()}`,
            label: `${task.type.replace(/_/g, ' ').toLowerCase()} · Room ${task.roomNumber}`,
            team: 'Housekeeping',
            owner: task.assignedToName ?? (task.assignedToId ? 'Assigned' : null),
            due: task.dueAt,
            status: task.status,
          }))
      : []),
    ...(ticketsResult.ok
      ? ticketsResult.data
          .filter((ticket) => ticket.status !== 'CLOSED' && ticket.status !== 'RESOLVED')
          .map((ticket) => ({
            id: `mt-${ticket.id}`,
            reference: `MT-${ticket.id.slice(-6).toUpperCase()}`,
            label: ticket.roomNumber ? `${ticket.summary} · Room ${ticket.roomNumber}` : ticket.summary,
            team: 'Maintenance',
            owner: ticket.assignedToName,
            due: ticket.dueAt,
            status: ticket.status,
          }))
      : []),
  ].sort((a, b) => {
    if (!a.due) return b.due ? 1 : 0;
    if (!b.due) return -1;
    return Date.parse(a.due) - Date.parse(b.due);
  });

  const arrivals = arrivalsResult.ok ? arrivalsResult.data.length : null;
  const perf = perfResult.ok ? perfResult.data.current : null;

  return (
    <>
      {summaryResult.ok ? null : (
        <SectionFailure failure={summaryResult} service="The reporting service" />
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Revenue today"
          value={summary ? minor(summary.revenueMinor, currency) : '—'}
          caption="Recognised so far"
        />
        <StatCard
          label="Occupancy"
          value={summary ? `${summary.occupancyPct.toFixed(1)}%` : '—'}
          caption={summary ? `${summary.roomsSold} of ${summary.roomsAvailable} rooms` : 'Unavailable'}
        />
        <StatCard
          label="Average daily rate"
          value={perf ? minor(perf.adr.amountMinor, perf.adr.currency) : '—'}
          caption="Last 30 days"
        />
        <StatCard
          label="Arrivals"
          value={arrivals === null ? '—' : String(arrivals)}
          caption="Due to check in today"
        />
        <StatCard
          label="Departures"
          value={summary ? String(summary.departures) : '—'}
          caption="Due to check out today"
        />
        <StatCard
          label="Cancellations"
          value={summary ? String(summary.cancellations) : '—'}
          caption="Today"
          invertDelta
        />
      </div>

      {boardResult.ok && boardResult.data.length > 0 ? (
        <RoomBoard
          floors={boardResult.data.map((floor) => ({
            floor: floor.floor,
            rooms: floor.rooms.map((room) => ({
              number: room.number,
              status: room.status,
              ...(room.note ? { note: room.note } : {}),
            })),
          }))}
        />
      ) : null}

      <section className="rounded-card border-line border bg-white">
        <header className="border-line flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-ink-900 text-sm font-semibold">Open tasks</h2>
          <span className="text-ink-400 text-xs">{openTasks.length} outstanding</span>
        </header>
        <DataTable
          columns={TASK_COLUMNS}
          rows={openTasks}
          rowKey={(row) => row.id}
          caption="Open housekeeping and maintenance work"
          emptyTitle="Nothing outstanding"
          emptyDescription="Housekeeping and maintenance work appears here while it is open."
        />
      </section>
    </>
  );
}
