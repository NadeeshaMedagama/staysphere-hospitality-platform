import {
  addMoney,
  money,
  multiplyMoney,
  subtractMoney,
  sumMoney,
  type Money,
} from '@staysphere/contracts';
import { eachNight, type StayRange } from './date-range.js';

export const RateKind = {
  BASE: 'BASE',
  WEEKEND: 'WEEKEND',
  SEASONAL: 'SEASONAL',
  PROMOTIONAL: 'PROMOTIONAL',
} as const;
export type RateKind = (typeof RateKind)[keyof typeof RateKind];

export interface RatePlan {
  readonly roomTypeId: string;
  readonly currency: string;
  /** Rack rate per night, in minor units. */
  readonly baseRateMinor: number;
  /** Multiplier applied on Friday and Saturday nights, e.g. 1.2 for +20%. */
  readonly weekendMultiplier: number;
  readonly seasonalRates: readonly SeasonalRate[];
  /** Tax as basis points, e.g. 1250 === 12.5%. Avoids float rounding drift. */
  readonly taxBasisPoints: number;
  /** Nightly discount thresholds, evaluated longest-first. */
  readonly longStayDiscounts: readonly LongStayDiscount[];
}

export interface SeasonalRate {
  readonly label: string;
  readonly from: Date;
  readonly to: Date;
  readonly nightlyRateMinor: number;
}

export interface LongStayDiscount {
  readonly minNights: number;
  readonly percentOff: number;
}

export interface NightlyCharge {
  readonly date: Date;
  readonly kind: RateKind;
  readonly label: string;
  readonly amount: Money;
}

export interface Quote {
  readonly nights: number;
  readonly nightly: readonly NightlyCharge[];
  readonly subtotal: Money;
  readonly discount: Money;
  readonly taxable: Money;
  readonly tax: Money;
  readonly total: Money;
  readonly currency: string;
}

export interface QuoteOptions {
  /** Fractional discount from a promo code, e.g. 0.1 for 10% off. */
  readonly promotionPercentOff?: number;
}

const FRIDAY = 5;
const SATURDAY = 6;

function isWeekendNight(date: Date): boolean {
  const day = date.getUTCDay();
  return day === FRIDAY || day === SATURDAY;
}

function seasonalFor(plan: RatePlan, date: Date): SeasonalRate | undefined {
  return plan.seasonalRates.find((season) => date >= season.from && date <= season.to);
}

/**
 * Prices a stay night by night.
 *
 * Per-night pricing (rather than nights × base rate) is what lets a stay
 * straddle a season boundary or a weekend and still be billed correctly, and it
 * gives the guest an itemised breakdown they can check.
 *
 * Precedence per night: seasonal override > weekend multiplier > base rate.
 */
export function quoteStay(plan: RatePlan, range: StayRange, options: QuoteOptions = {}): Quote {
  const nights = eachNight(range);

  const nightly: NightlyCharge[] = nights.map((date) => {
    const season = seasonalFor(plan, date);
    if (season) {
      return {
        date,
        kind: RateKind.SEASONAL,
        label: season.label,
        amount: money(season.nightlyRateMinor, plan.currency),
      };
    }
    if (isWeekendNight(date)) {
      return {
        date,
        kind: RateKind.WEEKEND,
        label: 'Weekend rate',
        amount: multiplyMoney(money(plan.baseRateMinor, plan.currency), plan.weekendMultiplier),
      };
    }
    return {
      date,
      kind: RateKind.BASE,
      label: 'Standard rate',
      amount: money(plan.baseRateMinor, plan.currency),
    };
  });

  const subtotal = sumMoney(
    nightly.map((charge) => charge.amount),
    plan.currency,
  );

  const longStayPercent = resolveLongStayDiscount(plan.longStayDiscounts, nights.length);
  const promotionPercent = options.promotionPercentOff ?? 0;
  // Discounts stack additively and are capped, so a promo plus a long-stay rate
  // can never drive the folio below zero.
  const totalPercentOff = Math.min(0.9, longStayPercent + promotionPercent);

  const discount = multiplyMoney(subtotal, totalPercentOff);
  const taxable = subtractMoney(subtotal, discount);
  const tax = multiplyMoney(taxable, plan.taxBasisPoints / 10_000);
  const total = addMoney(taxable, tax);

  return {
    nights: nights.length,
    nightly,
    subtotal,
    discount,
    taxable,
    tax,
    total,
    currency: plan.currency,
  };
}

/** Highest qualifying long-stay tier; 0 when none applies. */
export function resolveLongStayDiscount(
  discounts: readonly LongStayDiscount[],
  nights: number,
): number {
  return (
    [...discounts]
      .filter((tier) => nights >= tier.minNights)
      .sort((a, b) => b.minNights - a.minNights)[0]?.percentOff ?? 0
  );
}
