import { money, multiplyMoney, type Money } from '@staysphere/contracts';

export interface DemandSignal {
  /** Fraction of the room type already sold for the night, 0–1. */
  readonly occupancy: number;
  /** Nights until arrival. */
  readonly leadTimeDays: number;
  /** Whether the date falls in a period the property has flagged as high demand. */
  readonly highDemandDate: boolean;
}

export interface DynamicRateBounds {
  readonly minRateMinor: number | null;
  readonly maxRateMinor: number | null;
}

/**
 * Adjusts a nightly rate for demand.
 *
 * Three independent signals, multiplied then clamped:
 *
 * - **Occupancy** — the last rooms are worth more than the first. The curve is
 *   deliberately flat below 60%: discounting early does not create demand, it
 *   only gives away margin on rooms that would have sold anyway.
 * - **Lead time** — a booking made tomorrow is a room that would otherwise go
 *   empty, so late availability is discounted, while very early bookings pay a
 *   small premium for certainty.
 * - **Flagged dates** — an event or holiday the property has marked.
 *
 * The result is always clamped to the rate plan's floor and ceiling, so an
 * algorithm can never quote an absurd price. That clamp is the safety property
 * that makes dynamic pricing safe to turn on.
 */
export function applyDemandPricing(
  baseRate: Money,
  signal: DemandSignal,
  bounds: DynamicRateBounds = { minRateMinor: null, maxRateMinor: null },
): Money {
  const multiplier =
    occupancyMultiplier(signal.occupancy) *
    leadTimeMultiplier(signal.leadTimeDays) *
    (signal.highDemandDate ? 1.15 : 1);

  const adjusted = multiplyMoney(baseRate, multiplier);
  return money(clamp(adjusted.amountMinor, bounds), baseRate.currency);
}

/** 1.0 up to 60% sold, then rising to 1.35 as the last rooms go. */
export function occupancyMultiplier(occupancy: number): number {
  const bounded = Math.min(1, Math.max(0, occupancy));
  if (bounded <= 0.6) return 1;
  return 1 + ((bounded - 0.6) / 0.4) * 0.35;
}

/** Discounts imminent arrivals; a small premium for booking far ahead. */
export function leadTimeMultiplier(leadTimeDays: number): number {
  if (leadTimeDays <= 1) return 0.85;
  if (leadTimeDays <= 3) return 0.92;
  if (leadTimeDays <= 14) return 1;
  if (leadTimeDays <= 90) return 1.03;
  return 1.05;
}

function clamp(amountMinor: number, bounds: DynamicRateBounds): number {
  let value = amountMinor;
  if (bounds.minRateMinor !== null) value = Math.max(bounds.minRateMinor, value);
  if (bounds.maxRateMinor !== null) value = Math.min(bounds.maxRateMinor, value);
  return value;
}
