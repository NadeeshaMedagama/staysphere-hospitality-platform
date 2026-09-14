import { DomainError, ErrorCode } from '@staysphere/contracts';

/**
 * A hotel stay measured in *nights*, using half-open date semantics
 * `[checkIn, checkOut)`.
 *
 * Half-open is what makes back-to-back stays legal: a guest departing on the
 * 4th and one arriving on the 4th do not overlap, and a naive closed-interval
 * comparison would wrongly reject the second booking.
 */
export interface StayRange {
  readonly checkIn: Date;
  readonly checkOut: Date;
}

export const MAX_STAY_NIGHTS = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Normalises a timestamp to UTC midnight; hotel nights are date-granular. */
export function toStayDate(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export function nightsBetween(range: StayRange): number {
  return Math.round(
    (toStayDate(range.checkOut).getTime() - toStayDate(range.checkIn).getTime()) / MS_PER_DAY,
  );
}

/** True when two stays compete for the same room on at least one night. */
export function overlaps(a: StayRange, b: StayRange): boolean {
  return (
    toStayDate(a.checkIn) < toStayDate(b.checkOut) && toStayDate(b.checkIn) < toStayDate(a.checkOut)
  );
}

export interface ValidateStayOptions {
  readonly now: Date;
  readonly maxNights?: number;
  /** Allows a receptionist to record a walk-in for a date already in progress. */
  readonly allowSameDay?: boolean;
}

/** Validates a requested stay, throwing the precise reason it is unacceptable. */
export function assertValidStay(range: StayRange, options: ValidateStayOptions): void {
  const checkIn = toStayDate(range.checkIn);
  const checkOut = toStayDate(range.checkOut);
  const today = toStayDate(options.now);

  if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime())) {
    throw new DomainError(
      ErrorCode.INVALID_DATE_RANGE,
      'Check-in and check-out must be valid dates.',
    );
  }

  if (checkOut <= checkIn) {
    throw new DomainError(
      ErrorCode.INVALID_DATE_RANGE,
      'Check-out must be at least one night after check-in.',
      { details: { checkIn: checkIn.toISOString(), checkOut: checkOut.toISOString() } },
    );
  }

  if (checkIn < today && !options.allowSameDay) {
    throw new DomainError(ErrorCode.INVALID_DATE_RANGE, 'Check-in cannot be in the past.', {
      details: { checkIn: checkIn.toISOString(), today: today.toISOString() },
    });
  }

  const nights = nightsBetween(range);
  const maxNights = options.maxNights ?? MAX_STAY_NIGHTS;
  if (nights > maxNights) {
    throw new DomainError(
      ErrorCode.STAY_TOO_LONG,
      `A single reservation may not exceed ${maxNights} nights.`,
      { details: { nights, maxNights } },
    );
  }
}

/** Every night of the stay, as UTC-midnight dates. Excludes the departure day. */
export function eachNight(range: StayRange): Date[] {
  const nights: Date[] = [];
  const cursor = toStayDate(range.checkIn);
  const end = toStayDate(range.checkOut);
  while (cursor < end) {
    nights.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return nights;
}
