import { StatCard } from '@staysphere/ui';
import { dailySummary, type Scope } from '@/lib/data';
import { SectionFailure } from '@/components/section-state';
import { minor, shortDate } from './shared';

/**
 * The daily operating summary.
 *
 * The reporting service exposes a rolled-up figure per day rather than a list
 * of report documents, so this shows that roll-up. A scheduled-report library
 * would need an endpoint that does not exist yet.
 */
export async function ReportsSection({ scope }: { scope: Scope }) {
  const result = await dailySummary(scope);
  if (!result.ok) return <SectionFailure failure={result} service="The reporting service" />;

  const summary = result.data;

  return (
    <div className="space-y-5">
      <p className="text-ink-500 text-xs">Daily summary for {shortDate(summary.date)}</p>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Occupancy"
          value={`${summary.occupancyPct.toFixed(1)}%`}
          caption={`${summary.roomsSold} of ${summary.roomsAvailable} rooms`}
        />
        <StatCard label="Revenue" value={minor(summary.revenueMinor, summary.currency)} caption="Recognised today" />
        <StatCard label="Arrivals" value={String(summary.arrivals)} caption="Due to check in" />
        <StatCard label="Departures" value={String(summary.departures)} caption="Due to check out" />
        <StatCard label="Cancellations" value={String(summary.cancellations)} caption="Today" invertDelta />
        <StatCard label="Rooms sold" value={String(summary.roomsSold)} caption="Tonight" />
      </div>

      <div className="rounded-card border-line border border-dashed bg-white p-6">
        <h2 className="text-ink-900 text-sm font-semibold">Scheduled reports</h2>
        <p className="text-ink-500 mt-2 max-w-xl text-sm leading-relaxed">
          The reporting service rolls figures up on a schedule but does not yet expose a library of
          saved or emailed report documents, so there is nothing to list here.
        </p>
        <p className="text-ink-400 mt-3 max-w-xl text-xs">
          Available today: the daily summary above, and the period analysis under Analytics.
        </p>
      </div>
    </div>
  );
}
