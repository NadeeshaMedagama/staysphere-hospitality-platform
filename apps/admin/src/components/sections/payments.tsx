import { DataTable, StatCard, StatusBadge, type Column } from '@staysphere/ui';
import { payments, type Payment, type Scope } from '@/lib/data';
import { SectionFailure } from '@/components/section-state';
import { minor, shortDateTime } from './shared';

const COLUMNS: ReadonlyArray<Column<Payment>> = [
  {
    key: 'id',
    header: 'Payment',
    render: (row) => <span className="text-ink-900 font-mono text-xs">{row.id.slice(-8)}</span>,
  },
  {
    key: 'method',
    header: 'Method',
    render: (row) => (row.cardLast4 ? `${row.method} ···· ${row.cardLast4}` : row.method),
  },
  { key: 'provider', header: 'Provider', hideOnMobile: true, render: (row) => row.provider },
  { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
  {
    key: 'captured',
    header: 'Captured',
    numeric: true,
    render: (row) => minor(row.capturedMinor, row.currency),
  },
  {
    key: 'refunded',
    header: 'Refunded',
    numeric: true,
    hideOnMobile: true,
    render: (row) => minor(row.refundedMinor, row.currency),
  },
  {
    key: 'created',
    header: 'Taken',
    hideOnMobile: true,
    render: (row) => shortDateTime(row.createdAt),
  },
];

export async function PaymentsSection({ scope }: { scope: Scope }) {
  const result = await payments(scope);
  if (!result.ok) return <SectionFailure failure={result} service="The payment service" />;

  const rows = result.data;
  const currency = rows[0]?.currency ?? 'USD';
  const captured = rows.reduce((total, row) => total + row.capturedMinor, 0);
  const refunded = rows.reduce((total, row) => total + row.refundedMinor, 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Captured" value={minor(captured, currency)} caption="All time" />
        <StatCard
          label="Refunded"
          value={minor(refunded, currency)}
          caption="All time"
          invertDelta
        />
        <StatCard label="Net" value={minor(captured - refunded, currency)} caption="Captured less refunds" />
      </div>

      <div className="rounded-card border-line border bg-white">
        <DataTable
          columns={COLUMNS}
          rows={rows}
          rowKey={(row) => row.id}
          caption="Payments"
          emptyTitle="No payments recorded"
          emptyDescription="Captures, refunds and their provider references appear here."
        />
      </div>
    </div>
  );
}
