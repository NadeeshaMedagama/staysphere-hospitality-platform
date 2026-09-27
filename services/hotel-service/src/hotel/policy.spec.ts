import { DEFAULT_HOTEL_POLICY, ErrorCode, type HotelPolicy } from '@staysphere/contracts';
import { assertPolicyCoherent, turnoverWindowMinutes } from './policy';

const policy = (overrides: Partial<HotelPolicy> = {}): HotelPolicy => ({
  ...DEFAULT_HOTEL_POLICY,
  ...overrides,
});

describe('assertPolicyCoherent', () => {
  it('accepts the platform default', () => {
    expect(() => assertPolicyCoherent(DEFAULT_HOTEL_POLICY)).not.toThrow();
  });

  it('rejects a check-out that is not before check-in', () => {
    // Same-day turnover would be impossible.
    expect(() =>
      assertPolicyCoherent(policy({ checkOutBy: '15:00', checkInFrom: '14:00' })),
    ).toThrow(expect.objectContaining({ code: ErrorCode.VALIDATION_FAILED }));
    expect(() =>
      assertPolicyCoherent(policy({ checkOutBy: '14:00', checkInFrom: '14:00' })),
    ).toThrow();
  });

  it('rejects a malformed time', () => {
    expect(() => assertPolicyCoherent(policy({ checkInFrom: '2pm' }))).toThrow(
      expect.objectContaining({ code: ErrorCode.VALIDATION_FAILED }),
    );
  });

  it('rejects an impossible maximum stay', () => {
    expect(() => assertPolicyCoherent(policy({ maxStayNights: 0 }))).toThrow();
    expect(() => assertPolicyCoherent(policy({ maxStayNights: 400 }))).toThrow();
  });

  it('rejects a negative advance-booking window', () => {
    expect(() => assertPolicyCoherent(policy({ minAdvanceHours: -1 }))).toThrow();
  });

  it('rejects a child age limit on a property that does not accept children', () => {
    expect(() => assertPolicyCoherent(policy({ childrenAllowed: false, childMaxAge: 12 }))).toThrow(
      expect.objectContaining({ code: ErrorCode.VALIDATION_FAILED }),
    );
  });

  it('accepts an adults-only property with a zero child age', () => {
    expect(() =>
      assertPolicyCoherent(policy({ childrenAllowed: false, childMaxAge: 0 })),
    ).not.toThrow();
  });

  it('reports every failure, not just the first', () => {
    expect.assertions(1);
    try {
      assertPolicyCoherent(policy({ maxStayNights: 0, minAdvanceHours: -5 }));
    } catch (error) {
      expect((error as { details?: { failures: string[] } }).details?.failures.length).toBe(2);
    }
  });
});

describe('turnoverWindowMinutes', () => {
  it('measures the gap housekeeping has between departure and arrival', () => {
    expect(turnoverWindowMinutes(DEFAULT_HOTEL_POLICY)).toBe(180);
  });

  it('never returns a negative window', () => {
    expect(turnoverWindowMinutes(policy({ checkOutBy: '16:00', checkInFrom: '14:00' }))).toBe(0);
  });
});
