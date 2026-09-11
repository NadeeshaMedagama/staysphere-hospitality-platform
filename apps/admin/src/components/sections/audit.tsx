import { DataTable, StatusBadge, type Column } from '@staysphere/ui';
import { auditLog, type AuditEntry, type Scope } from '@/lib/data';
import { SectionFailure } from '@/components/section-state';
import { shortDateTime } from './shared';

const COLUMNS: ReadonlyArray<Column<AuditEntry>> = [
  { key: 'when', header: 'When', render: (row) => shortDateTime(row.createdAt) },
  { key: 'action', header: 'Action', render: (row) => row.action },
  {
    key: 'resource',
    header: 'Resource',
    render: (row) => (
      <span className="font-mono text-xs">
        {row.resource}
        {/* Not every entry is about one record — a sign-in attempt is not. */}
        {row.resourceId ? <span className="text-ink-400"> · {row.resourceId.slice(-8)}</span> : null}
      </span>
    ),
  },
  {
    key: 'actor',
    header: 'Actor',
    hideOnMobile: true,
    // Null actor means the platform acted on its own behalf, not a person.
    render: (row) => row.actorRoles?.[0] ?? row.actorEmail ?? 'System',
  },
  { key: 'outcome', header: 'Outcome', render: (row) => <StatusBadge status={row.outcome} /> },
];

export async function AuditSection({ scope }: { scope: Scope }) {
  const result = await auditLog(scope);
  if (!result.ok) return <SectionFailure failure={result} service="The audit service" />;

  return (
    <div className="rounded-card border-line border bg-white">
      <DataTable
        columns={COLUMNS}
        rows={result.data}
        rowKey={(row) => row.id}
        caption="Audit log"
        emptyTitle="Nothing recorded yet"
        emptyDescription="Every change made through the platform is written here as it happens."
      />
    </div>
  );
}
