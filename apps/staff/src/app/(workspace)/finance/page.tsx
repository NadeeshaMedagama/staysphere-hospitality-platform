import type { Metadata } from 'next';
import { formatMoney, money } from '@staysphere/contracts';
import { DataTable, PageHeader, StatCard, StatusBadge, type Column } from '@staysphere/ui';
import { SectionFailure } from '@/components/section-state';
import { invoices, payments, type Invoice, type Payment, type Scope } from '@/lib/data';
import { resolveHotel } from '@/lib/hotel';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Finance' };
export const dynamic = 'force-dynamic';

const DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function day(iso: string | null): string {
  if (!iso) return '—';
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? '—' : DATE.format(parsed);
}

const paymentColumns: ReadonlyArray<Column<Payment>> = [
  {
    key: 'method',
    header: 'Method',
    render: (row) => (row.cardLast4 ? `${row.method} ···· ${row.cardLast4}` : row.method),
  },
  { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
  {
    key: 'captured',
    header: 'Captured',
    numeric: true,
    render: (row) => formatMoney(money(row.capturedMinor, row.currency)),
  },
  {
    key: 'refunded',
    header: 'Refunded',
    numeric: true,
    hideOnMobile: true,
    render: (row) =>
      row.refundedMinor === 0 ? (
        <span className="text-ink-400">—</span>
      ) : (
        formatMoney(money(row.refundedMinor, row.currency))
      ),
  },
  { key: 'taken', header: 'Taken', numeric: true, hideOnMobile: true, render: (row) => day(row.createdAt) },
];

const invoiceColumns: ReadonlyArray<Column<Invoice>> = [
  {
    key: 'number',
    header: 'Invoice',
    render: (row) => <span className="text-ink-900 font-mono text-xs">{row.invoiceNumber}</span>,
  },
  { key: 'billTo', header: 'Bill to', render: (row) => row.billToName },
  { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
  { key: 'due', header: 'Due', hideOnMobile: true, render: (row) => day(row.dueAt) },
  {
    key: 'outstanding',
    header: 'Outstanding',
    numeric: true,
    render: (row) => {
      const owed = row.totalMinor - row.paidMinor - row.refundedMinor;
      return owed === 0 ? (
        <span className="text-ink-400">Settled</span>
      ) : (
        <span className="text-caution font-medium">{formatMoney(money(owed, row.currency))}</span>
      );
    },
  },
];

export default async function FinancePage() {
  const session = await requireSession();
  const hotel = await resolveHotel(session);

  if (!hotel) {
    return <PageHeader title="Finance" description="No property is attached to this account." />;
  }

  const scope: Scope = { hotelId: hotel.id, accessToken: session.accessToken };
  const [paymentsResult, invoicesResult] = await Promise.all([payments(scope), invoices(scope)]);

  const paymentRows = paymentsResult.ok ? paymentsResult.data : [];
  const invoiceRows = invoicesResult.ok ? invoicesResult.data : [];
  const currency = paymentRows[0]?.currency ?? invoiceRows[0]?.currency ?? hotel.currency;

  const captured = paymentRows.reduce((total, row) => total + row.capturedMinor, 0);
  const refunded = paymentRows.reduce((total, row) => total + row.refundedMinor, 0);
  // A voided invoice is not owed; counting it would overstate the ledger.
  const outstanding = invoiceRows
    .filter((row) => row.status !== 'VOID')
    .reduce((total, row) => total + (row.totalMinor - row.paidMinor - row.refundedMinor), 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Finance"
        description="Payments, refunds, invoices and outstanding balances."
        meta={<span className="text-ink-400 text-xs">{hotel.name}</span>}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Captured" value={formatMoney(money(captured, currency))} caption="All time" />
        <StatCard label="Refunded" value={formatMoney(money(refunded, currency))} caption="All time" invertDelta />
        <StatCard
          label="Outstanding"
          value={formatMoney(money(outstanding, currency))}
          caption="Still to collect"
          invertDelta
        />
      </div>

      <section className="rounded-card border-line bg-surface border">
        <header className="border-line border-b px-4 py-3">
          <h2 className="text-ink-900 text-sm font-semibold">Payments</h2>
        </header>
        {paymentsResult.ok ? (
          <DataTable
            columns={paymentColumns}
            rows={paymentRows}
            rowKey={(row) => row.id}
            caption="Payments"
            emptyTitle="No payments recorded"
            emptyDescription="Captures and refunds appear here as they are taken."
          />
        ) : (
          <div className="p-4">
            <SectionFailure failure={paymentsResult} service="The payment service" />
          </div>
        )}
      </section>

      <section className="rounded-card border-line bg-surface border">
        <header className="border-line border-b px-4 py-3">
          <h2 className="text-ink-900 text-sm font-semibold">Invoices</h2>
        </header>
        {invoicesResult.ok ? (
          <DataTable
            columns={invoiceColumns}
            rows={invoiceRows}
            rowKey={(row) => row.id}
            caption="Invoices"
            emptyTitle="No invoices issued"
            emptyDescription="Folios become invoices when a stay is closed or billed to a company."
          />
        ) : (
          <div className="p-4">
            <SectionFailure failure={invoicesResult} service="The finance service" />
          </div>
        )}
      </section>
    </div>
  );
}
