import { describe, expect, it } from 'vitest';
import { DEFAULT_HOTEL_POLICY, parseTimeOfDay } from './hotel.js';

describe('parseTimeOfDay', () => {
  it('converts a valid time to minutes past midnight', () => {
    expect(parseTimeOfDay('00:00')).toBe(0);
    expect(parseTimeOfDay('14:00')).toBe(840);
    expect(parseTimeOfDay('23:59')).toBe(1439);
  });

  it('rejects an out-of-range or malformed time', () => {
    expect(parseTimeOfDay('24:00')).toBeNull();
    expect(parseTimeOfDay('12:60')).toBeNull();
    expect(parseTimeOfDay('9:00')).toBeNull();
    expect(parseTimeOfDay('noon')).toBeNull();
  });

  it('orders the default policy so check-out precedes check-in', () => {
    // Departure must clear before the next arrival, or the room cannot turn over.
    expect(parseTimeOfDay(DEFAULT_HOTEL_POLICY.checkOutBy)).toBeLessThan(
      parseTimeOfDay(DEFAULT_HOTEL_POLICY.checkInFrom)!,
    );
  });
});
