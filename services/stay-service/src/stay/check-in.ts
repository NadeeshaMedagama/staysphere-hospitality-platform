import {
  BookingStatus,
  DomainError,
  ErrorCode,
  RoomStatus,
  parseTimeOfDay,
} from '@staysphere/contracts';

export interface CheckInCandidate {
  readonly bookingId: string;
  readonly bookingStatus: BookingStatus;
  readonly checkIn: Date;
  readonly checkOut: Date;
  readonly roomStatus: RoomStatus;
  readonly balanceDueMinor: number;
  readonly guests: number;
  readonly roomMaxOccupancy: number;
}

export interface CheckInPolicy {
  /** Local check-in time as `HH:mm`. */
  readonly checkInFrom: string;
  /** Whether the property takes payment before handing over the key. */
  readonly requiresPrepayment: boolean;
  /** How early, in hours, a guest may check in without a charge. */
  readonly graceHours: number;
}

export type CheckInBlock =
  | 'BOOKING_NOT_CONFIRMED'
  | 'WRONG_DAY'
  | 'ROOM_NOT_READY'
  | 'OCCUPANCY_EXCEEDED'
  | 'PAYMENT_OUTSTANDING';

export interface CheckInAssessment {
  readonly allowed: boolean;
  readonly blocks: readonly CheckInBlock[];
  /** True when the guest is arriving before the policy time. */
  readonly early: boolean;
  readonly hoursEarly: number;
  /** True when arriving early enough to warrant an early check-in charge. */
  readonly chargeEarlyCheckIn: boolean;
}

const BLOCK_MESSAGES: Record<CheckInBlock, string> = {
  BOOKING_NOT_CONFIRMED: 'The reservation is not confirmed.',
  WRONG_DAY: 'This reservation is not for today.',
  ROOM_NOT_READY: 'The room is not ready for arrival.',
  OCCUPANCY_EXCEEDED: 'The party is larger than the room allows.',
  PAYMENT_OUTSTANDING: 'Payment is outstanding and this property requires prepayment.',
};

/**
 * Decides whether a guest can be checked in, and what it should cost.
 *
 * Every blocking reason is collected rather than returning on the first, so a
 * receptionist sees the whole picture in one go instead of clearing one problem
 * only to discover another.
 */
export function assessCheckIn(
  candidate: CheckInCandidate,
  policy: CheckInPolicy,
  now: Date,
): CheckInAssessment {
  const blocks: CheckInBlock[] = [];

  if (candidate.bookingStatus !== BookingStatus.CONFIRMED) {
    blocks.push('BOOKING_NOT_CONFIRMED');
  }

  const arrivalDay = toUtcDay(candidate.checkIn);
  const today = toUtcDay(now);
  if (arrivalDay !== today) blocks.push('WRONG_DAY');

  // RESERVED is expected — the room was held for this very booking.
  if (
    candidate.roomStatus !== RoomStatus.AVAILABLE &&
    candidate.roomStatus !== RoomStatus.RESERVED
  ) {
    blocks.push('ROOM_NOT_READY');
  }

  if (candidate.guests > candidate.roomMaxOccupancy) blocks.push('OCCUPANCY_EXCEEDED');

  if (policy.requiresPrepayment && candidate.balanceDueMinor > 0) {
    blocks.push('PAYMENT_OUTSTANDING');
  }

  const policyMinutes = parseTimeOfDay(policy.checkInFrom) ?? 14 * 60;
  const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const minutesEarly = Math.max(0, policyMinutes - nowMinutes);
  const hoursEarly = Math.round((minutesEarly / 60) * 10) / 10;

  return {
    allowed: blocks.length === 0,
    blocks,
    early: minutesEarly > 0,
    hoursEarly,
    // Inside the grace window the property absorbs it; beyond it, it is a sale.
    chargeEarlyCheckIn: hoursEarly > policy.graceHours,
  };
}

export function assertCheckInAllowed(
  candidate: CheckInCandidate,
  policy: CheckInPolicy,
  now: Date,
): CheckInAssessment {
  const assessment = assessCheckIn(candidate, policy, now);
  if (!assessment.allowed) {
    const first = assessment.blocks[0] as CheckInBlock;
    throw new DomainError(ErrorCode.CONFLICT, BLOCK_MESSAGES[first], {
      details: { blocks: assessment.blocks, bookingId: candidate.bookingId },
    });
  }
  return assessment;
}

/** Hours past the policy check-out time, used to price a late departure. */
export function hoursLate(checkOutBy: string, departedAt: Date): number {
  const policyMinutes = parseTimeOfDay(checkOutBy) ?? 11 * 60;
  const actualMinutes = departedAt.getUTCHours() * 60 + departedAt.getUTCMinutes();
  return Math.max(0, Math.round(((actualMinutes - policyMinutes) / 60) * 10) / 10);
}

function toUtcDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}
