import { describe, expect, it } from 'vitest';
import {
  formatCompactMoney,
  formatDate,
  formatDateRange,
  formatMoney,
  formatPercent,
  formatRelative,
  formatTime,
  pluralise,
} from './format';

describe('formatMoney', () => {
  it('renders minor units as currency', () => {
    expect(formatMoney({ amountMinor: 40_350, currency: 'USD' })).toBe('$403.50');
  });

  it('renders zero rather than an empty string', () => {
    expect(formatMoney({ amountMinor: 0, currency: 'USD' })).toBe('$0.00');
  });

  it('renders a negative balance as a credit', () => {
    expect(formatMoney({ amountMinor: -5_000, currency: 'USD' })).toBe('-$50.00');
  });

  it('honours the currency', () => {
    expect(formatMoney({ amountMinor: 100_000, currency: 'EUR' })).toContain('€');
  });
});

describe('formatCompactMoney', () => {
  it('shortens a large figure for a stat tile', () => {
    expect(formatCompactMoney({ amountMinor: 124_839_200, currency: 'USD' })).toBe('$1.2M');
  });

  it('leaves a small figure readable', () => {
    expect(formatCompactMoney({ amountMinor: 40_350, currency: 'USD' })).toBe('$403.5');
  });
});

describe('formatPercent', () => {
  it('formats to one decimal by default', () => {
    expect(formatPercent(82.44)).toBe('82.4%');
    expect(formatPercent(82, 0)).toBe('82%');
  });
});

describe('date formatting', () => {
  it('formats a date in UTC regardless of the runner timezone', () => {
    expect(formatDate('2026-10-01T23:30:00Z')).toBe('Oct 1, 2026');
  });

  it('formats a 24-hour time', () => {
    expect(formatTime('2026-10-01T14:05:00Z')).toBe('14:05');
  });

  it('formats a stay range', () => {
    expect(formatDateRange('2026-10-01', '2026-10-04')).toBe('Oct 1, 2026 – Oct 4, 2026');
  });
});

describe('pluralise', () => {
  it('uses the singular for exactly one', () => {
    expect(pluralise(1, 'night')).toBe('1 night');
    expect(pluralise(3, 'night')).toBe('3 nights');
    expect(pluralise(0, 'night')).toBe('0 nights');
  });

  it('accepts an irregular plural', () => {
    expect(pluralise(2, 'person', 'people')).toBe('2 people');
  });
});

describe('formatRelative', () => {
  const now = new Date('2026-09-09T12:00:00Z');

  it('describes the near future and past', () => {
    expect(formatRelative('2026-09-09T14:00:00Z', now)).toBe('in 2 hours');
    expect(formatRelative('2026-09-09T09:00:00Z', now)).toBe('3 hours ago');
  });

  it('picks the largest sensible unit', () => {
    expect(formatRelative('2026-09-12T12:00:00Z', now)).toBe('in 3 days');
    expect(formatRelative('2026-09-09T12:00:30Z', now)).toBe('in 30 seconds');
  });

  it('uses natural language for adjacent days', () => {
    expect(formatRelative('2026-09-10T12:00:00Z', now)).toBe('tomorrow');
  });
});
