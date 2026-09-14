import { ErrorCode } from '@staysphere/contracts';
import { assertValidStay, eachNight, nightsBetween, overlaps, toStayDate } from './date-range';

const d = (iso: string) => new Date(iso);

describe('nightsBetween', () => {
  it('counts nights, not calendar days', () => {
    expect(nightsBetween({ checkIn: d('2026-10-01'), checkOut: d('2026-10-04') })).toBe(3);
  });

  it('ignores the time of day', () => {
    expect(
      nightsBetween({
        checkIn: d('2026-10-01T14:00:00Z'),
        checkOut: d('2026-10-02T11:00:00Z'),
      }),
    ).toBe(1);
  });

  it('spans a month boundary', () => {
    expect(nightsBetween({ checkIn: d('2026-10-30'), checkOut: d('2026-11-02') })).toBe(3);
  });
});

describe('overlaps', () => {
  const stay = { checkIn: d('2026-10-01'), checkOut: d('2026-10-05') };

  it('detects a fully contained stay', () => {
    expect(overlaps(stay, { checkIn: d('2026-10-02'), checkOut: d('2026-10-03') })).toBe(true);
  });

  it('detects a partial overlap at either end', () => {
    expect(overlaps(stay, { checkIn: d('2026-09-29'), checkOut: d('2026-10-02') })).toBe(true);
    expect(overlaps(stay, { checkIn: d('2026-10-04'), checkOut: d('2026-10-08') })).toBe(true);
  });

  it('allows a same-day turnover — departure day is not occupied', () => {
    expect(overlaps(stay, { checkIn: d('2026-10-05'), checkOut: d('2026-10-08') })).toBe(false);
    expect(overlaps(stay, { checkIn: d('2026-09-28'), checkOut: d('2026-10-01') })).toBe(false);
  });

  it('is symmetric', () => {
    const other = { checkIn: d('2026-10-03'), checkOut: d('2026-10-09') };
    expect(overlaps(stay, other)).toBe(overlaps(other, stay));
  });
});

describe('assertValidStay', () => {
  const now = d('2026-09-08T10:00:00Z');

  it('accepts a normal future stay', () => {
    expect(() =>
      assertValidStay({ checkIn: d('2026-10-01'), checkOut: d('2026-10-04') }, { now }),
    ).not.toThrow();
  });

  it('rejects a zero-night stay', () => {
    expect(() =>
      assertValidStay({ checkIn: d('2026-10-01'), checkOut: d('2026-10-01') }, { now }),
    ).toThrow(expect.objectContaining({ code: ErrorCode.INVALID_DATE_RANGE }));
  });

  it('rejects an inverted range', () => {
    expect(() =>
      assertValidStay({ checkIn: d('2026-10-05'), checkOut: d('2026-10-01') }, { now }),
    ).toThrow(expect.objectContaining({ code: ErrorCode.INVALID_DATE_RANGE }));
  });

  it('rejects a check-in in the past', () => {
    expect(() =>
      assertValidStay({ checkIn: d('2026-09-01'), checkOut: d('2026-09-03') }, { now }),
    ).toThrow(expect.objectContaining({ code: ErrorCode.INVALID_DATE_RANGE }));
  });

  it('accepts a same-day arrival for a walk-in', () => {
    expect(() =>
      assertValidStay({ checkIn: d('2026-09-08'), checkOut: d('2026-09-09') }, { now }),
    ).not.toThrow();
  });

  it('lets a receptionist back-date a walk-in when explicitly allowed', () => {
    expect(() =>
      assertValidStay(
        { checkIn: d('2026-09-07'), checkOut: d('2026-09-09') },
        { now, allowSameDay: true },
      ),
    ).not.toThrow();
  });

  it('rejects a stay beyond the maximum length', () => {
    expect(() =>
      assertValidStay(
        { checkIn: d('2026-10-01'), checkOut: d('2027-02-01') },
        { now, maxNights: 90 },
      ),
    ).toThrow(expect.objectContaining({ code: ErrorCode.STAY_TOO_LONG }));
  });
});

describe('eachNight', () => {
  it('enumerates every occupied night and excludes the departure day', () => {
    const nights = eachNight({ checkIn: d('2026-10-01'), checkOut: d('2026-10-04') });
    expect(nights.map((n) => n.toISOString().slice(0, 10))).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
    ]);
  });

  it('returns an empty list for a zero-night range', () => {
    expect(eachNight({ checkIn: d('2026-10-01'), checkOut: d('2026-10-01') })).toEqual([]);
  });
});

describe('toStayDate', () => {
  it('truncates to UTC midnight', () => {
    expect(toStayDate(d('2026-10-01T23:59:59Z')).toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });
});
