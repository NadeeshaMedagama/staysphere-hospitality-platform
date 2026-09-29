import { DomainError, ErrorCode } from '@staysphere/contracts';

/**
 * Derives the floor from a room number.
 *
 * Hotels number rooms as `<floor><sequence>`: 101 is floor 1, 1204 is floor 12.
 * A leading `B` marks a basement level. Anything else is ambiguous and must be
 * supplied explicitly rather than guessed — putting a room on the wrong floor
 * sends housekeeping to the wrong place.
 */
export function deriveFloor(roomNumber: string): number | null {
  const trimmed = roomNumber.trim().toUpperCase();

  const basement = /^B(\d)(\d{2})$/.exec(trimmed);
  if (basement) return -Number(basement[1]);

  if (!/^\d{3,4}$/.test(trimmed)) return null;

  // The last two digits are the sequence on the floor; the rest is the floor.
  return Number(trimmed.slice(0, trimmed.length - 2));
}

export interface RoomNumberPlan {
  readonly floor: number;
  readonly count: number;
  /** First sequence number on the floor; defaults to 1. */
  readonly startAt?: number;
}

/**
 * Generates the room numbers for a floor.
 *
 * Used when a property is first configured — typing 147 room numbers by hand is
 * how duplicates and gaps get introduced.
 */
export function generateRoomNumbers(plan: RoomNumberPlan): string[] {
  const startAt = plan.startAt ?? 1;

  if (plan.count < 1 || plan.count > 99) {
    throw DomainError.validation('A floor must have between 1 and 99 rooms.', {
      count: plan.count,
    });
  }
  if (startAt < 1 || startAt + plan.count - 1 > 99) {
    throw DomainError.validation('Room sequence numbers must stay within 01–99 on a floor.', {
      startAt,
      count: plan.count,
    });
  }
  if (plan.floor === 0 || plan.floor > 99 || plan.floor < -9) {
    throw new DomainError(
      ErrorCode.VALIDATION_FAILED,
      'Floor must be between -9 and 99, and not 0.',
    );
  }

  const prefix = plan.floor < 0 ? `B${Math.abs(plan.floor)}` : String(plan.floor);
  return Array.from(
    { length: plan.count },
    (_, index) => `${prefix}${String(startAt + index).padStart(2, '0')}`,
  );
}

/** Sorts room numbers the way a floor board should read them. */
export function compareRoomNumbers(a: string, b: string): number {
  const floorA = deriveFloor(a) ?? Number.MAX_SAFE_INTEGER;
  const floorB = deriveFloor(b) ?? Number.MAX_SAFE_INTEGER;
  if (floorA !== floorB) return floorA - floorB;
  return a.localeCompare(b, 'en', { numeric: true });
}
