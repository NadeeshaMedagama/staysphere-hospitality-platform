import { DomainError, ErrorCode, parseTimeOfDay, type HotelPolicy } from '@staysphere/contracts';

/**
 * Validates a property's operating policy.
 *
 * These rules are enforced here rather than at the API edge because booking and
 * stay both read the stored policy and assume it is coherent — an incoherent
 * policy would surface much later as an unsellable room.
 */
export function assertPolicyCoherent(policy: HotelPolicy): void {
  const checkIn = parseTimeOfDay(policy.checkInFrom);
  const checkOut = parseTimeOfDay(policy.checkOutBy);
  const failures: string[] = [];

  if (checkIn === null) failures.push('checkInFrom must be a 24-hour HH:mm time');
  if (checkOut === null) failures.push('checkOutBy must be a 24-hour HH:mm time');

  if (checkIn !== null && checkOut !== null && checkOut >= checkIn) {
    // Departure has to clear before the next arrival, or the room can never
    // turn over and same-day back-to-back bookings become unsellable.
    failures.push('checkOutBy must be earlier in the day than checkInFrom');
  }

  if (policy.maxStayNights < 1) failures.push('maxStayNights must be at least 1');
  if (policy.maxStayNights > 365) failures.push('maxStayNights cannot exceed 365');
  if (policy.minAdvanceHours < 0) failures.push('minAdvanceHours cannot be negative');
  if (policy.childMaxAge < 0 || policy.childMaxAge > 17) {
    failures.push('childMaxAge must be between 0 and 17');
  }
  if (!policy.childrenAllowed && policy.childMaxAge > 0) {
    failures.push('childMaxAge must be 0 when children are not accepted');
  }

  if (failures.length > 0) {
    throw new DomainError(ErrorCode.VALIDATION_FAILED, `Invalid property policy: ${failures[0]}.`, {
      details: { failures },
    });
  }
}

/** Minutes a guest would need to wait between the policy check-out and check-in. */
export function turnoverWindowMinutes(policy: HotelPolicy): number {
  const checkIn = parseTimeOfDay(policy.checkInFrom) ?? 0;
  const checkOut = parseTimeOfDay(policy.checkOutBy) ?? 0;
  return Math.max(0, checkIn - checkOut);
}
