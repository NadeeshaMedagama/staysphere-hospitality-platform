import { DataTable, StatCard, type Column } from '@staysphere/ui';
import { channelMix, performance, trend, type ChannelMix, type Scope, type TrendPoint } from '@/lib/data';
import { SectionFailure } from '@/components/section-state';
import { minor, shortDate } from './shared';

const TREND_COLUMNS: ReadonlyArray<Column<TrendPoint>> = [
  { key: 'period', header: 'Date', render: (row) => shortDate(row.period) },
  { key: 'sold', header: 'Rooms sold', numeric: true, render: (row) => row.roomsSold },
  {
    key: 'occupancy',
    header: 'Occupancy',
    numeric: true,
    render: (row) => `${row.occupancyPct.toFixed(1)}%`,
  },
  { key: 'adr', header: 'ADR', numeric: true, render: (row) => minor(row.adrMinor, row.currency) },
  {
    key: 'revpar',
    header: 'RevPAR',
    numeric: true,
    render: (row) => minor(row.revparMinor, row.currency),
  },
  {
    key: 'revenue',
    header: 'Room revenue',
    numeric: true,
    hideOnMobile: true,
    render: (row) => minor(row.roomRevenueMinor, row.currency),
  },
];

const CHANNEL_COLUMNS: ReadonlyArray<Column<ChannelMix>> = [
  { key: 'channel', header: 'Channel', render: (row) => row.channel },
  { key: 'bookings', header: 'Bookings', numeric: true, render: (row) => row.bookings },
  { key: 'nights', header: 'Room nights', numeric: true, render: (row) => row.roomNights },
  {
    key: 'revenue',
    header: 'Revenue',
    numeric: true,
    render: (row) => minor(row.revenueMinor, row.currency),
  },
];

export async function AnalyticsSection({
  scope,
  from,
  to,
}: {
  scope: Scope;
  from: string;
  to: string;
}) {
  const [performanceResult, trendResult, channelResult] = await Promise.all([
    performance(scope, from, to),
    trend(scope, from, to),
    channelMix(scope, from, to),
  ]);

  if (!performanceResult.ok) {
    return <SectionFailure failure={performanceResult} service="The reporting service" />;
  }

  const current = performanceResult.data.current;

  return (
    <div className="space-y-5">
      <p className="text-ink-500 text-xs">
        {shortDate(from)} – {shortDate(to)}
      </p>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Occupancy"
          value={`${current.occupancyPct.toFixed(1)}%`}
          caption={`${current.roomsSold} of ${current.roomsAvailable} room nights`}
        />
        <StatCard label="ADR" value={minor(current.adr.amountMinor, current.adr.currency)} caption="Average daily rate" />
        <StatCard label="RevPAR" value={minor(current.revpar.amountMinor, current.revpar.currency)} caption="Revenue per available room" />
        <StatCard label="TRevPAR" value={minor(current.trevpar.amountMinor, current.trevpar.currency)} caption="Total revenue per available room" />
        <StatCard label="Room revenue" value={minor(current.roomRevenue.amountMinor, current.roomRevenue.currency)} caption="Accommodation only" />
        <StatCard label="Total revenue" value={minor(current.totalRevenue.amountMinor, current.totalRevenue.currency)} caption="Including extras" />
      </div>

      <section className="rounded-card border-line border bg-white">
        <header className="border-line border-b px-4 py-3">
          <h2 className="text-ink-900 text-sm font-semibold">Daily trend</h2>
        </header>
        {trendResult.ok ? (
          <DataTable
            columns={TREND_COLUMNS}
            rows={trendResult.data}
            rowKey={(row) => row.period}
            caption="Performance by day"
            emptyTitle="No days in this range"
            emptyDescription="A day appears once its figures have been rolled up."
          />
        ) : (
          <div className="p-4">
            <SectionFailure failure={trendResult} service="The reporting service" />
          </div>
        )}
      </section>

      <section className="rounded-card border-line border bg-white">
        <header className="border-line border-b px-4 py-3">
          <h2 className="text-ink-900 text-sm font-semibold">Channel mix</h2>
        </header>
        {channelResult.ok ? (
          <DataTable
            columns={CHANNEL_COLUMNS}
            rows={channelResult.data}
            rowKey={(row) => row.channel}
            caption="Bookings by channel"
            emptyTitle="No channel data in this range"
            emptyDescription="Mix is derived from confirmed bookings, grouped by the channel each came through."
          />
        ) : (
          <div className="p-4">
            <SectionFailure failure={channelResult} service="The reporting service" />
          </div>
        )}
      </section>
    </div>
  );
}
