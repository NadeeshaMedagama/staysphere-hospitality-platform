/**
 * Money is represented in minor units (cents) as an integer. Floating point
 * arithmetic is never used for currency anywhere in the platform.
 */
export interface Money {
  /** Integer amount in the currency's minor unit, e.g. 12050 === USD 120.50 */
  readonly amountMinor: number;
  /** ISO-4217 code, uppercase. */
  readonly currency: string;
}

export const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'LKR', 'AUD', 'AED'] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export function money(amountMinor: number, currency: string): Money {
  if (!Number.isInteger(amountMinor)) {
    throw new TypeError(`Money must use integer minor units, received ${amountMinor}`);
  }
  return { amountMinor, currency: currency.toUpperCase() };
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountMinor + b.amountMinor, a.currency);
}

export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountMinor - b.amountMinor, a.currency);
}

export function multiplyMoney(a: Money, factor: number): Money {
  return money(Math.round(a.amountMinor * factor), a.currency);
}

export function sumMoney(items: readonly Money[], currency: string): Money {
  return items.reduce((acc, item) => addMoney(acc, item), money(0, currency));
}

export function formatMoney(value: Money, locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: value.currency,
  }).format(value.amountMinor / 100);
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new TypeError(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}
