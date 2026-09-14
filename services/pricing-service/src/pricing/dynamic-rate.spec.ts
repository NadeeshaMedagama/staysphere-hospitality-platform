import { money } from '@staysphere/contracts';
import { applyDemandPricing, leadTimeMultiplier, occupancyMultiplier } from './dynamic-rate';

const base = money(12_000, 'USD');
const neutral = { occupancy: 0.3, leadTimeDays: 30, highDemandDate: false };

describe('occupancyMultiplier', () => {
  it('does not discount below 60% sold', () => {
    // Cutting price on rooms that would sell anyway just gives away margin.
    expect(occupancyMultiplier(0)).toBe(1);
    expect(occupancyMultiplier(0.6)).toBe(1);
  });

  it('rises as the last rooms sell', () => {
    expect(occupancyMultiplier(0.8)).toBeCloseTo(1.175, 3);
    expect(occupancyMultiplier(1)).toBeCloseTo(1.35, 3);
  });

  it('clamps values outside 0–1', () => {
    expect(occupancyMultiplier(-0.5)).toBe(1);
    expect(occupancyMultiplier(1.5)).toBeCloseTo(1.35, 3);
  });
});

describe('leadTimeMultiplier', () => {
  it('discounts an imminent arrival', () => {
    expect(leadTimeMultiplier(0)).toBe(0.85);
    expect(leadTimeMultiplier(2)).toBe(0.92);
  });

  it('is neutral in the normal booking window', () => {
    expect(leadTimeMultiplier(10)).toBe(1);
  });

  it('adds a small premium for booking far ahead', () => {
    expect(leadTimeMultiplier(60)).toBe(1.03);
    expect(leadTimeMultiplier(200)).toBe(1.05);
  });
});

describe('applyDemandPricing', () => {
  it('leaves a quiet, mid-window night close to the base rate', () => {
    expect(applyDemandPricing(base, neutral).amountMinor).toBe(12_360);
  });

  it('raises the rate when the room type is nearly sold out', () => {
    const busy = applyDemandPricing(base, { ...neutral, occupancy: 0.95 });
    expect(busy.amountMinor).toBeGreaterThan(base.amountMinor);
  });

  it('discounts a last-minute booking on a quiet night', () => {
    const lastMinute = applyDemandPricing(base, {
      occupancy: 0.2,
      leadTimeDays: 1,
      highDemandDate: false,
    });
    expect(lastMinute.amountMinor).toBeLessThan(base.amountMinor);
  });

  it('adds a premium on a flagged date', () => {
    const plain = applyDemandPricing(base, neutral).amountMinor;
    const flagged = applyDemandPricing(base, { ...neutral, highDemandDate: true }).amountMinor;
    expect(flagged).toBeGreaterThan(plain);
  });

  it('never quotes below the rate plan floor', () => {
    const result = applyDemandPricing(
      base,
      { occupancy: 0, leadTimeDays: 0, highDemandDate: false },
      { minRateMinor: 11_000, maxRateMinor: null },
    );
    expect(result.amountMinor).toBe(11_000);
  });

  it('never quotes above the rate plan ceiling', () => {
    const result = applyDemandPricing(
      base,
      { occupancy: 1, leadTimeDays: 200, highDemandDate: true },
      { minRateMinor: null, maxRateMinor: 15_000 },
    );
    expect(result.amountMinor).toBe(15_000);
  });

  it('always returns whole minor units in the base currency', () => {
    const result = applyDemandPricing(base, {
      occupancy: 0.77,
      leadTimeDays: 5,
      highDemandDate: true,
    });
    expect(Number.isInteger(result.amountMinor)).toBe(true);
    expect(result.currency).toBe('USD');
  });
});
