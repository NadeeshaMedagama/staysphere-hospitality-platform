import { formatMoney, type Money } from '@staysphere/contracts';

export function price(value: Money, locale = 'en-US'): string {
  return formatMoney(value, locale);
}

export function nightsLabel(nights: number): string {
  return `${nights} ${nights === 1 ? 'night' : 'nights'}`;
}

export function stayDates(checkIn: Date, checkOut: Date, locale = 'en-US'): string {
  const format = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  return `${format.format(checkIn)} – ${format.format(checkOut)}`;
}
