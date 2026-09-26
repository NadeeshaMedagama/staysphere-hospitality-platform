import type { Metadata } from 'next';
import { BookingStatus, formatMoney, money } from '@staysphere/contracts';
import {
  DataTable,
  PageHeader,
  StatCard,
  StatusBadge,
  formatTime,
  type Column,
} from '@staysphere/ui';
import { SectionFailure } from '@/components/section-state';
import { inHouse, listBookings, type Booking, type InHouseStay, type Scope } from '@/lib/data';
import { resolveHotel, todayAt } from '@/lib/hotel';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Reception' };

// The desk's working view of right now; a cached copy is worse than useless.
export const dynamic = 'force-dynamic';

function balance(row: Booking): number {
  return row.totalMinor - row.paidMinor;
}

const arrivalColumns: ReadonlyArray<Column<Booking>> = [
  {
    key: 'reference',
    header: 'Reference',
    render: (row) => <span className="text-ink-500 font-mono text-xs">{row.reference}</span>,
  },
  {
    key: 'guest',
    header: 'Guest',
    render: (row) => <span className="text-ink-900 font-medium">{row.guestName}</span>,
  },
  { key: 'roomType', header: 'Room type', render: (row) => row.roomTypeId, hideOnMobile: true },
  {
    key: 'room',
    header: 'Room',
    render: (row) =>
      row.roomId ? (
        <span className="tabular-nums">{row.roomId.slice(-4)}</span>
      ) : (
        <span className="text-caution">Unassigned</span>
      ),
  },
  { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
  { key: 'nights', header: 'Nights', numeric: true, render: (row) => row.nights },
  {
    key: 'balance',
    header: 'Balance',
    numeric: true,
    render: (row) =>
      balance(row) === 0 ? (
        <span className="text-ink-400">Settled</span>
      ) : (
        <span className="text-caution font-medium">
          {formatMoney(money(balance(row), row.currency))}
        </span>
      ),
  },
];

const inHouseColumns: ReadonlyArray<Column<InHouseStay>> = [
  {
    key: 'room',
    header: 'Room',
    render: (row) => (
      <span className="text-ink-900 font-medium tabular-nums">{row.roomNumber ?? '—'}</span>
    ),
  },
  { key: 'guest', header: 'Guest', render: (row) => row.guestName },
  {
    key: 'since',
    header: 'Checked in',
    hideOnMobile: true,
    render: (row) => formatTime(row.checkInAt),
  },
  {
    key: 'folio',
    header: 'Folio',
    numeric: true,
    render: (row) =>
      row.balanceMinor === 0 ? (
        <span className="text-ink-400">Settled</span>
      ) : (
        <span className="text-caution font-medium">
          {formatMoney(money(row.balanceMinor, row.currency))}
        </span>
      ),
  },
];

export default async function ReceptionPage() {
  const session = await requireSession();
  const hotel = await resolveHotel(session);

  if (!hotel) {
    return (
      <PageHeader
        title="Reception"
        description="No property is attached to this account, so there is no desk to show."
      />
    );
  }

  const scope: Scope = { hotelId: hotel.id, accessToken: session.accessToken };
  const today = todayAt(hotel.timezone);

  const [arrivalsResult, checkedInResult, inHouseResult] = await Promise.all([
    listBookings(scope, { from: today, to: today, pageSize: 100 }),
    listBookings(scope, { status: BookingStatus.CHECKED_IN, pageSize: 100 }),
    inHouse(scope),
  ]);

  const arrivals = arrivalsResult.ok ? arrivalsResult.data : [];
  const departures = checkedInResult.ok
    ? checkedInResult.data.filter((booking) => booking.checkOut.slice(0, 10) === today)
    : [];
  const stays = inHouseResult.ok ? inHouseResult.data : [];

  const unassigned = arrivals.filter((arrival) => !arrival.roomId).length;
  const unsettled = stays.filter((stay) => stay.balanceMinor > 0).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reception"
        description="Everything due today, in the order it needs attention."
        meta={<span className="text-ink-400 text-xs">{hotel.name}</span>}
      />

      {arrivalsResult.ok ? null : (
        <SectionFailure failure={arrivalsResult} service="The booking service" />
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Arrivals today" value={String(arrivals.length)} caption="Due to check in" />
        <StatCard
          label="Departures today"
          value={String(departures.length)}
          caption="Due to check out"
        />
        <StatCard
          label="Rooms unassigned"
          value={String(unassigned)}
          caption="Assign before arrival"
          invertDelta
          {...(unassigned > 0 ? { delta: { value: String(unassigned), direction: 'up' as const } } : {})}
        />
        <StatCard
          label="Unsettled folios"
          value={String(unsettled)}
          caption="In house with a balance"
          invertDelta
        />
      </div>

      <section className="rounded-card border-line bg-surface border">
        <header className="border-line border-b px-4 py-3">
          <h2 className="text-ink-900 text-sm font-semibold">Arrivals</h2>
        </header>
        <DataTable
          columns={arrivalColumns}
          rows={arrivals}
          rowKey={(row) => row.id}
          caption="Arrivals today"
          emptyTitle="No arrivals today"
          emptyDescription="Nobody is due to check in on this date."
        />
      </section>

      <section className="rounded-card border-line bg-surface border">
        <header className="border-line border-b px-4 py-3">
          <h2 className="text-ink-900 text-sm font-semibold">In house</h2>
        </header>
        {inHouseResult.ok ? (
          <DataTable
            columns={inHouseColumns}
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
