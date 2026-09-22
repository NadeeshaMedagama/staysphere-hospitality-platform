import {
  ZERO_KPIS,
  compareKpis,
  computeKpis,
  occupancyFor,
  percentChange,
  type DailyPerformance,
} from './kpi';

const day = (overrides: Partial<DailyPerformance> = {}): DailyPerformance => ({
  date: new Date('2026-09-09'),
  roomsAvailable: 100,
  roomsSold: 80,
  roomRevenueMinor: 960_000, // 80 rooms × $120
  serviceRevenueMinor: 120_000,
  currency: 'USD',
  ...overrides,
});

describe('computeKpis', () => {
  it('returns zeros for a period with no data', () => {
    expect(computeKpis([], 'USD')).toEqual(ZERO_KPIS('USD'));
  });

  it('computes occupancy, ADR and RevPAR for one night', () => {
    const kpis = computeKpis([day()], 'USD');
    expect(kpis.occupancyPct).toBe(80);
    expect(kpis.adr.amountMinor).toBe(12_000); // $120 per room sold
    expect(kpis.revpar.amountMinor).toBe(9_600); // $96 per room available
  });

  it('separates what we charged from how well we filled the building', () => {
    // One room at $500 in a 100-room hotel: ADR is high, RevPAR is not.
    const kpis = computeKpis(
      [
        day({
          roomsAvailable: 100,
          roomsSold: 1,
          roomRevenueMinor: 50_000,
          serviceRevenueMinor: 0,
        }),
      ],
      'USD',
    );
    expect(kpis.adr.amountMinor).toBe(50_000);
    expect(kpis.revpar.amountMinor).toBe(500);
    expect(kpis.occupancyPct).toBe(1);
  });

  it('includes service revenue in TRevPAR but not RevPAR', () => {
    const kpis = computeKpis([day()], 'USD');
    expect(kpis.revpar.amountMinor).toBe(9_600);
    expect(kpis.trevpar.amountMinor).toBe(10_800);
  });

  it('aggregates over room-nights, not as a mean of daily averages', () => {
    // A full Saturday must outweigh a quiet Tuesday.
    const kpis = computeKpis(
      [
        day({ roomsAvailable: 100, roomsSold: 10, roomRevenueMinor: 100_000 }),
        day({ roomsAvailable: 100, roomsSold: 90, roomRevenueMinor: 1_800_000 }),
      ],
      'USD',
    );
    // 1,900,000 ÷ 100 rooms sold = 19,000, not the mean of 10,000 and 20,000.
    expect(kpis.adr.amountMinor).toBe(19_000);
    expect(kpis.occupancyPct).toBe(50);
  });

  it('never divides by zero on a night with no rooms available', () => {
    const kpis = computeKpis(
      [day({ roomsAvailable: 0, roomsSold: 0, roomRevenueMinor: 0, serviceRevenueMinor: 0 })],
      'USD',
    );
    expect(kpis.occupancyPct).toBe(0);
    expect(kpis.revpar.amountMinor).toBe(0);
    expect(kpis.adr.amountMinor).toBe(0);
  });

  it('reports ADR as zero rather than infinity when nothing sold', () => {
    const kpis = computeKpis([day({ roomsSold: 0, roomRevenueMinor: 0 })], 'USD');
    expect(kpis.adr.amountMinor).toBe(0);
  });

  it('counts the nights in the period', () => {
    expect(computeKpis([day(), day(), day()], 'USD').nights).toBe(3);
  });

  it('keeps every monetary figure an integer in the requested currency', () => {
    const kpis = computeKpis([day({ roomsSold: 77, roomRevenueMinor: 933_333 })], 'LKR');
    for (const amount of [kpis.adr, kpis.revpar, kpis.trevpar, kpis.roomRevenue]) {
      expect(Number.isInteger(amount.amountMinor)).toBe(true);
      expect(amount.currency).toBe('LKR');
    }
  });
});

describe('compareKpis', () => {
  it('reports occupancy in points and rates in percent', () => {
    const current = computeKpis([day({ roomsSold: 85, roomRevenueMinor: 1_020_000 })], 'USD');
    const previous = computeKpis([day({ roomsSold: 80, roomRevenueMinor: 960_000 })], 'USD');
    const comparison = compareKpis(current, previous);

    // 80% → 85% is +5 points, not +6.25%.
    expect(comparison.deltas.occupancyPoints).toBe(5);
    expect(comparison.deltas.adrPct).toBe(0);
    expect(comparison.deltas.revparPct).toBe(6.3);
  });

  it('reports a decline as a negative delta', () => {
    const current = computeKpis([day({ roomsSold: 60, roomRevenueMinor: 600_000 })], 'USD');
    const previous = computeKpis([day()], 'USD');
    expect(compareKpis(current, previous).deltas.occupancyPoints).toBe(-20);
    expect(compareKpis(current, previous).deltas.adrPct).toBeLessThan(0);
  });
});

describe('percentChange', () => {
  it('computes an ordinary change', () => {
    expect(percentChange(100, 125)).toBe(25);
    expect(percentChange(100, 75)).toBe(-25);
  });

  it('handles growth from nothing without dividing by zero', () => {
    expect(percentChange(0, 500)).toBe(100);
    expect(percentChange(0, 0)).toBe(0);
  });
});

describe('occupancyFor', () => {
  it('computes a single night', () => {
    expect(occupancyFor(82, 100)).toBe(82);
    expect(occupancyFor(1, 3)).toBe(33.3);
  });

  it('returns zero when nothing is available', () => {
    expect(occupancyFor(0, 0)).toBe(0);
    expect(occupancyFor(5, -1)).toBe(0);
  });
});
