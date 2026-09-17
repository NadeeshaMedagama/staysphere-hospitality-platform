import { DataTable, StatCard, StatusBadge, type Column } from '@staysphere/ui';
import { housekeepingTasks, type HousekeepingTask, type Scope } from '@/lib/data';
import { SectionFailure } from '@/components/section-state';
import { shortDateTime } from './shared';

const COLUMNS: ReadonlyArray<Column<HousekeepingTask>> = [
  { key: 'room', header: 'Room', render: (row) => row.roomNumber },
  { key: 'floor', header: 'Floor', numeric: true, hideOnMobile: true, render: (row) => row.floor },
  { key: 'type', header: 'Task', render: (row) => <StatusBadge status={row.type} /> },
  { key: 'priority', header: 'Priority', render: (row) => <StatusBadge status={row.priority} /> },
  { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
  {
    key: 'assignee',
    header: 'Assigned to',
    // The name is only resolved when the service picks the assignee itself, so
    // the id is what decides whether the task belongs to anyone.
    render: (row) =>
      row.assignedToName ??
      (row.assignedToId ? 'Assigned' : <span className="text-caution">Unassigned</span>),
  },
  { key: 'due', header: 'Due', hideOnMobile: true, render: (row) => shortDateTime(row.dueAt) },
];

export async function HousekeepingSection({ scope }: { scope: Scope }) {
  const result = await housekeepingTasks(scope, { pageSize: 100 });
  if (!result.ok) return <SectionFailure failure={result} service="The housekeeping service" />;

  const tasks = result.data;
  const unassigned = tasks.filter((task) => !task.assignedToId).length;
  const open = tasks.filter((task) => task.status !== 'VERIFIED' && task.status !== 'COMPLETED');

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Open tasks" value={String(open.length)} caption="Not yet completed" />
        <StatCard label="Unassigned" value={String(unassigned)} caption="Need an owner" />
        <StatCard label="All tasks" value={String(tasks.length)} caption="Across the property" />
      </div>

      <div className="rounded-card border-line border bg-white">
        <DataTable
          columns={COLUMNS}
          rows={tasks}
          rowKey={(row) => row.id}
          caption="Housekeeping tasks"
          emptyTitle="The queue is clear"
          emptyDescription="Tasks are raised automatically on checkout and can also be added by hand."
        />
      </div>
    </div>
  );
}
