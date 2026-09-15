export interface MoneyLike {
  readonly amountMinor: number;
  readonly currency: string;
}

/** Formats integer minor units for display. Never used for arithmetic. */
export function formatMoney(value: MoneyLike, locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: value.currency,
  }).format(value.amountMinor / 100);
}

/** A compact figure for a stat tile: 1.2M rather than 1,248,392. */
export function formatCompactMoney(value: MoneyLike, locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: value.currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value.amountMinor / 100);
}

export function formatPercent(value: number, fractionDigits = 1): string {
  return `${value.toFixed(fractionDigits)}%`;
}

export function formatDate(value: Date | string, locale = 'en-US'): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function formatTime(value: Date | string, locale = 'en-US'): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }).format(date);
}

export function formatDateRange(from: Date | string, to: Date | string, locale = 'en-US'): string {
  return `${formatDate(from, locale)} – ${formatDate(to, locale)}`;
}

export function pluralise(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** "in 2 hours", "3 days ago" — for queues where recency is the point. */
export function formatRelative(value: Date | string, now: Date, locale = 'en-US'): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const deltaSeconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];

  for (const [unit, seconds] of units) {
    if (Math.abs(deltaSeconds) >= seconds) {
      return formatter.format(Math.round(deltaSeconds / seconds), unit);
    }
  }
  return formatter.format(deltaSeconds, 'second');
}
