import { DataTable, StatusBadge, type Column } from '@staysphere/ui';
import { listBookings, type Booking, type Scope } from '@/lib/data';
import { SectionFailure } from '@/components/section-state';
import { dateRange, minor } from './shared';

const COLUMNS: ReadonlyArray<Column<Booking>> = [
  {
    key: 'reference',
    header: 'Reference',
    render: (row) => <span className="text-ink-900 font-mono text-xs">{row.reference}</span>,
  },
  { key: 'guest', header: 'Guest', render: (row) => row.guestName },
  {
    key: 'stay',
    header: 'Stay',
    render: (row) => `${dateRange(row.checkIn, row.checkOut)} · ${row.nights}n`,
  },
  { key: 'roomType', header: 'Room type', hideOnMobile: true, render: (row) => row.roomTypeId },
  { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
  {
    key: 'payment',
    header: 'Payment',
    hideOnMobile: true,
    render: (row) => <StatusBadge status={row.paymentStatus} />,
  },
  {
    key: 'total',
    header: 'Total',
    numeric: true,
    render: (row) => minor(row.totalMinor, row.currency),
  },
];

export async function ReservationsSection({ scope }: { scope: Scope }) {
  const result = await listBookings(scope, { pageSize: 50 });
  if (!result.ok) return <SectionFailure failure={result} service="The booking service" />;

  return (
    <>
      <p className="text-ink-500 mb-3 text-xs">
        {result.meta?.totalItems ?? result.data.length} reservations
      </p>
      <div className="rounded-card border-line border bg-white">
        <DataTable
          columns={COLUMNS}
          rows={result.data}
          rowKey={(row) => row.id}
          caption="Reservations"
          emptyTitle="No reservations yet"
          emptyDescription="Reservations appear here as soon as a guest books, on any channel."
        />
      </div>
    </>
  );
}
