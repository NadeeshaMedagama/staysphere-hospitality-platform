import { BookingStatus } from '@staysphere/contracts';
import { DataTable, StatCard, StatusBadge, type Column } from '@staysphere/ui';
import { inHouse, listBookings, type Booking, type InHouseStay, type Scope } from '@/lib/data';
import { SectionFailure } from '@/components/section-state';
import { minor, shortDate, shortDateTime } from './shared';

const ARRIVAL_COLUMNS: ReadonlyArray<Column<Booking>> = [
  {
    key: 'reference',
    header: 'Reference',
    render: (row) => <span className="text-ink-900 font-mono text-xs">{row.reference}</span>,
  },
  { key: 'guest', header: 'Guest', render: (row) => row.guestName },
  {
    key: 'party',
    header: 'Party',
    hideOnMobile: true,
    render: (row) => `${row.adults + row.children} guest${row.adults + row.children === 1 ? '' : 's'}`,
  },
  { key: 'roomType', header: 'Room type', hideOnMobile: true, render: (row) => row.roomTypeId },
  { key: 'nights', header: 'Nights', numeric: true, render: (row) => row.nights },
  { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
  {
    key: 'balance',
    header: 'Balance',
    numeric: true,
    render: (row) => minor(row.totalMinor - row.paidMinor, row.currency),
  },
];

const IN_HOUSE_COLUMNS: ReadonlyArray<Column<InHouseStay>> = [
  { key: 'room', header: 'Room', render: (row) => row.roomNumber ?? '—' },
  { key: 'guest', header: 'Guest', render: (row) => row.guestName },
  {
    key: 'since',
    header: 'Checked in',
    hideOnMobile: true,
    render: (row) => shortDateTime(row.checkInAt),
  },
  { key: 'due', header: 'Departing', render: (row) => shortDate(row.expectedCheckOut) },
  {
    key: 'balance',
    header: 'Folio balance',
    numeric: true,
    render: (row) => minor(row.balanceMinor, row.currency),
  },
];

/**
 * The front desk's working view of the day.
 *
 * Arrivals and departures are two different questions about the same date, so
 * they are two filtered reads rather than one list the reader has to sort out.
 */
export async function ArrivalsSection({ scope, today }: { scope: Scope; today: string }) {
  const [arrivalsResult, departuresResult, inHouseResult] = await Promise.all([
    listBookings(scope, { from: today, to: today, pageSize: 100 }),
    listBookings(scope, { pageSize: 100, status: BookingStatus.CHECKED_IN }),
    inHouse(scope),
  ]);

  if (!arrivalsResult.ok) {
    return <SectionFailure failure={arrivalsResult} service="The booking service" />;
  }

  // `from`/`to` bracket the check-in date, so this read is the arrivals list.
  const arrivals = arrivalsResult.data;
  const departures = departuresResult.ok
    ? departuresResult.data.filter((booking) => booking.checkOut.slice(0, 10) === today)
    : [];
  const stays = inHouseResult.ok ? inHouseResult.data : [];

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Arriving today" value={String(arrivals.length)} caption={shortDate(today)} />
        <StatCard label="Departing today" value={String(departures.length)} caption={shortDate(today)} />
        <StatCard label="In house" value={String(stays.length)} caption="Currently checked in" />
      </div>

      <section className="rounded-card border-line border bg-white">
        <header className="border-line border-b px-4 py-3">
          <h2 className="text-ink-900 text-sm font-semibold">Arrivals</h2>
        </header>
        <DataTable
          columns={ARRIVAL_COLUMNS}
          rows={arrivals}
          rowKey={(row) => row.id}
          caption="Arrivals today"
          emptyTitle="No arrivals today"
          emptyDescription="Nobody is due to check in on this date."
        />
      </section>

      <section className="rounded-card border-line border bg-white">
        <header className="border-line border-b px-4 py-3">
          <h2 className="text-ink-900 text-sm font-semibold">In house</h2>
        </header>
        {inHouseResult.ok ? (
          <DataTable
            columns={IN_HOUSE_COLUMNS}
            rows={stays}
            rowKey={(row) => row.id}
            caption="Guests currently in house"
            emptyTitle="Nobody is in house"
            emptyDescription="Guests appear here between check-in and check-out."
          />
        ) : (
          <div className="p-4">
            <SectionFailure failure={inHouseResult} service="The stay service" />
          </div>
        )}
      </section>
    </div>
  );
}
