import { money, type Money } from '@staysphere/contracts';

export interface DailyPerformance {
  readonly date: Date;
  readonly roomsAvailable: number;
  readonly roomsSold: number;
  readonly roomRevenueMinor: number;
  readonly serviceRevenueMinor: number;
  readonly currency: string;
}

export interface HotelKpis {
  /** Rooms sold ÷ rooms available, as a percentage to one decimal. */
  readonly occupancyPct: number;
  /** Average Daily Rate — room revenue ÷ rooms *sold*. */
  readonly adr: Money;
  /** Revenue per Available Room — room revenue ÷ rooms *available*. */
  readonly revpar: Money;
  /** Total Revenue per Available Room, including services. */
  readonly trevpar: Money;
  readonly roomsSold: number;
  readonly roomsAvailable: number;
  readonly roomRevenue: Money;
  readonly totalRevenue: Money;
  readonly nights: number;
}

export const ZERO_KPIS = (currency: string): HotelKpis => ({
  occupancyPct: 0,
  adr: money(0, currency),
  revpar: money(0, currency),
  trevpar: money(0, currency),
  roomsSold: 0,
  roomsAvailable: 0,
  roomRevenue: money(0, currency),
  totalRevenue: money(0, currency),
  nights: 0,
});

/**
 * Computes the three figures every hotel is actually managed by.
 *
 * The distinction that matters:
 *
 * - **ADR** divides by rooms *sold*. It answers "what did we charge?" — a hotel
 *   that sold one room at £500 has an ADR of £500.
 * - **RevPAR** divides by rooms *available*. It answers "how well did we use the
 *   building?" — that same hotel, with 100 rooms, has a RevPAR of £5.
 *
 * A high ADR with a low RevPAR means the rate is right and the occupancy is not.
 * Reporting only ADR is how a property convinces itself an empty hotel is doing
 * well, which is precisely the mistake this separation exists to prevent.
 *
 * Aggregation is over *room-nights*, not an average of daily averages: a
 * mean-of-means would weight a quiet Tuesday the same as a full Saturday.
 */
export function computeKpis(days: readonly DailyPerformance[], currency: string): HotelKpis {
  if (days.length === 0) return ZERO_KPIS(currency);

  const totals = days.reduce(
    (acc, day) => ({
      roomsAvailable: acc.roomsAvailable + day.roomsAvailable,
      roomsSold: acc.roomsSold + day.roomsSold,
      roomRevenueMinor: acc.roomRevenueMinor + day.roomRevenueMinor,
      serviceRevenueMinor: acc.serviceRevenueMinor + day.serviceRevenueMinor,
    }),
    { roomsAvailable: 0, roomsSold: 0, roomRevenueMinor: 0, serviceRevenueMinor: 0 },
  );

  const totalRevenueMinor = totals.roomRevenueMinor + totals.serviceRevenueMinor;

  return {
    occupancyPct:
      totals.roomsAvailable === 0
        ? 0
        : Math.round((totals.roomsSold / totals.roomsAvailable) * 1000) / 10,
    adr: money(
      totals.roomsSold === 0 ? 0 : Math.round(totals.roomRevenueMinor / totals.roomsSold),
      currency,
    ),
    revpar: money(
      totals.roomsAvailable === 0 ? 0 : Math.round(totals.roomRevenueMinor / totals.roomsAvailable),
      currency,
    ),
    trevpar: money(
      totals.roomsAvailable === 0 ? 0 : Math.round(totalRevenueMinor / totals.roomsAvailable),
      currency,
    ),
    roomsSold: totals.roomsSold,
    roomsAvailable: totals.roomsAvailable,
    roomRevenue: money(totals.roomRevenueMinor, currency),
    totalRevenue: money(totalRevenueMinor, currency),
    nights: days.length,
  };
}

export interface PeriodComparison {
  readonly current: HotelKpis;
  readonly previous: HotelKpis;
  readonly deltas: {
    readonly occupancyPoints: number;
    readonly adrPct: number;
    readonly revparPct: number;
  };
}

/**
 * Compares two periods.
 *
 * Occupancy moves in *percentage points* (82% → 85% is +3 points, not +3.7%),
 * while rates move in percent. Reporting occupancy as a percentage change is a
 * classic way to make a small shift look dramatic.
 */
export function compareKpis(current: HotelKpis, previous: HotelKpis): PeriodComparison {
  return {
    current,
    previous,
    deltas: {
      occupancyPoints: Math.round((current.occupancyPct - previous.occupancyPct) * 10) / 10,
      adrPct: percentChange(previous.adr.amountMinor, current.adr.amountMinor),
      revparPct: percentChange(previous.revpar.amountMinor, current.revpar.amountMinor),
    },
  };
}

/** Percentage change, guarding the divide-by-zero on a period with no revenue. */
export function percentChange(from: number, to: number): number {
  if (from === 0) return to === 0 ? 0 : 100;
  return Math.round(((to - from) / from) * 1000) / 10;
}

/** Occupancy for a single night, as a percentage to one decimal. */
export function occupancyFor(roomsSold: number, roomsAvailable: number): number {
  if (roomsAvailable <= 0) return 0;
  return Math.round((roomsSold / roomsAvailable) * 1000) / 10;
}
