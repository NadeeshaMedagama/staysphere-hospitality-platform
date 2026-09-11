import { describe, expect, it } from 'vitest';
import {
  BOOKING_TRANSITIONS,
  BookingStatus,
  INVENTORY_HOLDING_STATUSES,
  canTransition,
} from './booking.js';

describe('booking state machine', () => {
  it('allows the happy path through the stay lifecycle', () => {
    expect(canTransition(BookingStatus.PENDING, BookingStatus.CONFIRMED)).toBe(true);
    expect(canTransition(BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN)).toBe(true);
    expect(canTransition(BookingStatus.CHECKED_IN, BookingStatus.CHECKED_OUT)).toBe(true);
  });

  it('refuses to skip states', () => {
    expect(canTransition(BookingStatus.PENDING, BookingStatus.CHECKED_IN)).toBe(false);
    expect(canTransition(BookingStatus.PENDING, BookingStatus.CHECKED_OUT)).toBe(false);
  });

  it('treats CHECKED_OUT, CANCELLED and NO_SHOW as terminal', () => {
    for (const terminal of [
      BookingStatus.CHECKED_OUT,
      BookingStatus.CANCELLED,
      BookingStatus.NO_SHOW,
    ]) {
      expect(BOOKING_TRANSITIONS[terminal]).toHaveLength(0);
    }
  });

  it('cannot cancel a stay that has already begun', () => {
    expect(canTransition(BookingStatus.CHECKED_IN, BookingStatus.CANCELLED)).toBe(false);
  });

  it('counts exactly the three statuses that hold inventory', () => {
    expect([...INVENTORY_HOLDING_STATUSES].sort()).toEqual(
      [BookingStatus.CHECKED_IN, BookingStatus.CONFIRMED, BookingStatus.PENDING].sort(),
    );
  });
});
