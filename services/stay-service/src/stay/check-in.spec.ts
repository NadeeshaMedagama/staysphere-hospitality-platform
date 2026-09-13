import { BookingStatus, ErrorCode, RoomStatus } from '@staysphere/contracts';
import {
  assertCheckInAllowed,
  assessCheckIn,
  hoursLate,
  type CheckInCandidate,
  type CheckInPolicy,
} from './check-in';

const now = new Date('2026-09-09T13:00:00Z');

const candidate = (overrides: Partial<CheckInCandidate> = {}): CheckInCandidate => ({
  bookingId: 'bkg_1',
  bookingStatus: BookingStatus.CONFIRMED,
  checkIn: new Date('2026-09-09T14:00:00Z'),
  checkOut: new Date('2026-09-12T11:00:00Z'),
  roomStatus: RoomStatus.RESERVED,
  balanceDueMinor: 0,
  guests: 2,
  roomMaxOccupancy: 2,
  ...overrides,
});

const policy: CheckInPolicy = {
  checkInFrom: '14:00',
  requiresPrepayment: false,
  graceHours: 2,
};

describe('assessCheckIn', () => {
  it('allows a confirmed, paid arrival into a reserved room', () => {
    const result = assessCheckIn(candidate(), policy, now);
    expect(result.allowed).toBe(true);
    expect(result.blocks).toEqual([]);
  });

  it('accepts a room that is available rather than specifically reserved', () => {
    expect(
      assessCheckIn(candidate({ roomStatus: RoomStatus.AVAILABLE }), policy, now).allowed,
    ).toBe(true);
  });

  it('blocks an unconfirmed reservation', () => {
    expect(
      assessCheckIn(candidate({ bookingStatus: BookingStatus.PENDING }), policy, now).blocks,
    ).toContain('BOOKING_NOT_CONFIRMED');
  });

  it('blocks a reservation for another day', () => {
    expect(
      assessCheckIn(candidate({ checkIn: new Date('2026-09-11T14:00:00Z') }), policy, now).blocks,
    ).toContain('WRONG_DAY');
  });

  it('blocks a room that is still being cleaned or repaired', () => {
    for (const roomStatus of [RoomStatus.CLEANING, RoomStatus.MAINTENANCE, RoomStatus.OCCUPIED]) {
      expect(assessCheckIn(candidate({ roomStatus }), policy, now).blocks).toContain(
        'ROOM_NOT_READY',
      );
    }
  });

  it('blocks a party larger than the room allows', () => {
    expect(assessCheckIn(candidate({ guests: 3 }), policy, now).blocks).toContain(
      'OCCUPANCY_EXCEEDED',
    );
  });

  it('blocks an unpaid arrival only where the property requires prepayment', () => {
    const unpaid = candidate({ balanceDueMinor: 12_000 });
    expect(assessCheckIn(unpaid, policy, now).allowed).toBe(true);
    expect(assessCheckIn(unpaid, { ...policy, requiresPrepayment: true }, now).blocks).toContain(
      'PAYMENT_OUTSTANDING',
    );
  });

  it('collects every blocking reason, not just the first', () => {
    const result = assessCheckIn(
      candidate({
        bookingStatus: BookingStatus.PENDING,
        roomStatus: RoomStatus.CLEANING,
        guests: 5,
      }),
      policy,
      now,
    );
    expect(result.blocks).toHaveLength(3);
  });

  it('recognises an early arrival inside the grace window without charging', () => {
    const result = assessCheckIn(candidate(), policy, new Date('2026-09-09T13:00:00Z'));
    expect(result.early).toBe(true);
    expect(result.hoursEarly).toBe(1);
    expect(result.chargeEarlyCheckIn).toBe(false);
  });

  it('charges for an arrival well before the policy time', () => {
    const result = assessCheckIn(candidate(), policy, new Date('2026-09-09T09:00:00Z'));
    expect(result.hoursEarly).toBe(5);
    expect(result.chargeEarlyCheckIn).toBe(true);
  });

  it('does not treat an on-time or late arrival as early', () => {
    const result = assessCheckIn(candidate(), policy, new Date('2026-09-09T16:30:00Z'));
    expect(result.early).toBe(false);
    expect(result.hoursEarly).toBe(0);
  });
});

describe('assertCheckInAllowed', () => {
  it('returns the assessment when check-in is permitted', () => {
    expect(assertCheckInAllowed(candidate(), policy, now).allowed).toBe(true);
  });

  it('throws a receptionist-readable reason listing every block', () => {
    expect.assertions(2);
    try {
      assertCheckInAllowed(candidate({ roomStatus: RoomStatus.CLEANING }), policy, now);
    } catch (error) {
      const domainError = error as { code: string; details?: { blocks: string[] } };
      expect(domainError.code).toBe(ErrorCode.CONFLICT);
      expect(domainError.details?.blocks).toEqual(['ROOM_NOT_READY']);
    }
  });
});

describe('hoursLate', () => {
  it('is zero for an on-time departure', () => {
    expect(hoursLate('11:00', new Date('2026-09-12T10:30:00Z'))).toBe(0);
    expect(hoursLate('11:00', new Date('2026-09-12T11:00:00Z'))).toBe(0);
  });

  it('measures how far past the policy time the guest left', () => {
    expect(hoursLate('11:00', new Date('2026-09-12T14:30:00Z'))).toBe(3.5);
  });
});
