import { formatMoney, money } from '@staysphere/contracts';

/**
 * Money from a service's `<field>Minor` + `currency` pair.
 *
 * The currency is genuinely optional on some records — a maintenance ticket
 * stores `costMinor` with a default of 0 and leaves `currency` null until a
 * cost is actually recorded. `money()` uppercases the code, so passing that
 * null through crashes the whole section; and defaulting it to USD would
 * invent a currency the platform never recorded.
 */
export function minor(amountMinor: number, currency: string | null | undefined): string {
  if (!currency) {
    // Nothing recorded at all reads better as a dash than as a fake zero.
    return amountMinor === 0 ? '—' : (amountMinor / 100).toFixed(2);
  }
  return formatMoney(money(amountMinor, currency));
}

const DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

const DATE_TIME = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function shortDate(iso: string | null): string {
  if (!iso) return '—';
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? '—' : DATE.format(parsed);
}

export function shortDateTime(iso: string | null): string {
  if (!iso) return '—';
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? '—' : DATE_TIME.format(parsed);
}

/** `26 Jun – 29 Jun` for a stay. */
export function dateRange(from: string, to: string): string {
  return `${shortDate(from)} – ${shortDate(to)}`;
}
