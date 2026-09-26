import type { Metadata } from 'next';
import { DataTable, PageHeader, StatCard, StatusBadge, type Column } from '@staysphere/ui';
import { Assignee } from '@/components/assignee';
import { RowAction, RowActionWithNote } from '@/components/row-action';
import { SectionFailure } from '@/components/section-state';
import {
  completeHousekeepingTask,
  startHousekeepingTask,
  takeHousekeepingTask,
} from '@/app/actions';
import { housekeepingTasks, type HousekeepingTask, type Scope } from '@/lib/data';
import { resolveHotel } from '@/lib/hotel';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Housekeeping' };
export const dynamic = 'force-dynamic';

const TIME = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });

function due(iso: string | null): string {
  if (!iso) return '—';
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? '—' : TIME.format(parsed);
}

function columnsFor(viewerId: string): ReadonlyArray<Column<HousekeepingTask>> {
  return [
  {
    key: 'room',
    header: 'Room',
    render: (row) => <span className="text-ink-900 font-medium tabular-nums">{row.roomNumber}</span>,
  },
  { key: 'floor', header: 'Floor', numeric: true, hideOnMobile: true, render: (row) => row.floor },
  { key: 'type', header: 'Task', render: (row) => <StatusBadge status={row.type} /> },
  { key: 'priority', header: 'Priority', render: (row) => <StatusBadge status={row.priority} /> },
  { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
  {
    key: 'assignee',
    header: 'Assigned to',
    render: (row) => (
      <Assignee
        assignedToId={row.assignedToId}
        assignedToName={row.assignedToName}
        viewerId={viewerId}
      />
    ),
  },
  { key: 'due', header: 'Due', numeric: true, render: (row) => due(row.dueAt) },
  {
    key: 'action',
    header: '',
    className: 'text-right',
    // One button per row: the next step for this task, not a menu of every
    // transition the state machine allows.
    render: (row) => <TaskAction task={row} />,
  },
  ];
}

function TaskAction({ task }: { task: HousekeepingTask }) {
  if (task.status === 'PENDING') {
    return <RowAction action={takeHousekeepingTask} id={task.id} label="Take" />;
  }
  if (task.status === 'ASSIGNED') {
    return <RowAction action={startHousekeepingTask} id={task.id} label="Start" />;
  }
  if (task.status === 'IN_PROGRESS') {
    return (
      <RowActionWithNote
        action={completeHousekeepingTask}
        id={task.id}
        label="Complete"
        field="notes"
        placeholder="Anything to note?"
      />
    );
  }
  return <span className="text-ink-400 text-xs">Done</span>;
}

export default async function HousekeepingPage() {
  const session = await requireSession();
  const hotel = await resolveHotel(session);

  if (!hotel) {
    return <PageHeader title="Housekeeping" description="No property is attached to this account." />;
  }

  const scope: Scope = { hotelId: hotel.id, accessToken: session.accessToken };
  const result = await housekeepingTasks(scope, { pageSize: 100 });

  if (!result.ok) {
    return (
      <div className="space-y-5">
        <PageHeader title="Housekeeping" description="Your round, checklists and inspections." />
        <SectionFailure failure={result} service="The housekeeping service" />
      </div>
    );
  }

  const tasks = result.data;
  const open = tasks.filter((task) => task.status !== 'VERIFIED' && task.status !== 'COMPLETED');
  const unassigned = tasks.filter((task) => !task.assignedToId).length;
  const inProgress = tasks.filter((task) => task.status === 'IN_PROGRESS').length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Housekeeping"
        description="Your round, checklists and inspections."
        meta={<span className="text-ink-400 text-xs">{hotel.name}</span>}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Open" value={String(open.length)} caption="Not yet completed" />
        <StatCard label="In progress" value={String(inProgress)} caption="Being cleaned now" />
        <StatCard label="Unassigned" value={String(unassigned)} caption="Need an owner" invertDelta />
      </div>

      <section className="rounded-card border-line bg-surface border">
        <header className="border-line border-b px-4 py-3">
          <h2 className="text-ink-900 text-sm font-semibold">Queue</h2>
        </header>
        <DataTable
          columns={columnsFor(session.user.id)}
          rows={tasks}
          rowKey={(row) => row.id}
          caption="Housekeeping tasks"
          emptyTitle="The round is clear"
          emptyDescription="Tasks are raised automatically on checkout and can also be added by hand."
        />
      </section>
    </div>
  );
}
