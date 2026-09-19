import { DataTable, StatCard, StatusBadge, type Column } from '@staysphere/ui';
import { invoices, type Invoice, type Scope } from '@/lib/data';
import { SectionFailure } from '@/components/section-state';
import { minor, shortDate } from './shared';

const COLUMNS: ReadonlyArray<Column<Invoice>> = [
  {
    key: 'number',
    header: 'Invoice',
    render: (row) => <span className="text-ink-900 font-mono text-xs">{row.invoiceNumber}</span>,
  },
  { key: 'billTo', header: 'Bill to', render: (row) => row.billToName },
  { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
  { key: 'issued', header: 'Issued', hideOnMobile: true, render: (row) => shortDate(row.issuedAt) },
  { key: 'due', header: 'Due', hideOnMobile: true, render: (row) => shortDate(row.dueAt) },
  {
    key: 'total',
    header: 'Total',
    numeric: true,
    render: (row) => minor(row.totalMinor, row.currency),
  },
  {
    key: 'outstanding',
    header: 'Outstanding',
    numeric: true,
    render: (row) => minor(row.totalMinor - row.paidMinor - row.refundedMinor, row.currency),
  },
];

export async function InvoicesSection({ scope }: { scope: Scope }) {
  const result = await invoices(scope);
  if (!result.ok) return <SectionFailure failure={result} service="The finance service" />;

  const rows = result.data;
  const currency = rows[0]?.currency ?? 'USD';
  // A voided invoice is not owed, and counting it as outstanding would overstate
  // the ledger every time one is cancelled.
  const live = rows.filter((row) => row.status !== 'VOID');
  const billed = live.reduce((total, row) => total + row.totalMinor, 0);
  const outstanding = live.reduce(
    (total, row) => total + (row.totalMinor - row.paidMinor - row.refundedMinor),
    0,
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Billed" value={minor(billed, currency)} caption="Excluding voided" />
        <StatCard label="Outstanding" value={minor(outstanding, currency)} caption="Still to collect" invertDelta />
        <StatCard label="Invoices" value={String(rows.length)} caption={`${rows.length - live.length} voided`} />
      </div>

      <div className="rounded-card border-line border bg-white">
        <DataTable
          columns={COLUMNS}
          rows={rows}
          rowKey={(row) => row.id}
          caption="Invoices"
          emptyTitle="No invoices issued"
          emptyDescription="Folios become invoices when a stay is closed or billed to a company."
        />
      </div>
    </div>
  );
}
