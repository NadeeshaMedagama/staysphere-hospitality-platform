import { DomainError, ErrorCode, RoomStatus } from '@staysphere/contracts';

/**
 * Operational transitions a room may make.
 *
 * The normal sale cycle is AVAILABLE → RESERVED → OCCUPIED → CLEANING →
 * AVAILABLE. MAINTENANCE and OUT_OF_SERVICE are reachable from any non-occupied
 * state, because a fault can be discovered at any point — but *not* from
 * OCCUPIED: a guest in the room has to be moved first, which is a front-desk
 * decision, not a status flip.
 */
export const ROOM_TRANSITIONS: Readonly<Record<RoomStatus, readonly RoomStatus[]>> = {
  [RoomStatus.AVAILABLE]: [
    RoomStatus.RESERVED,
    RoomStatus.OCCUPIED,
    RoomStatus.CLEANING,
    RoomStatus.MAINTENANCE,
    RoomStatus.OUT_OF_SERVICE,
  ],
  [RoomStatus.RESERVED]: [
    RoomStatus.OCCUPIED,
    RoomStatus.AVAILABLE,
    RoomStatus.CLEANING,
    RoomStatus.MAINTENANCE,
    RoomStatus.OUT_OF_SERVICE,
  ],
  [RoomStatus.OCCUPIED]: [RoomStatus.CLEANING, RoomStatus.AVAILABLE],
  [RoomStatus.CLEANING]: [RoomStatus.AVAILABLE, RoomStatus.MAINTENANCE, RoomStatus.OUT_OF_SERVICE],
  [RoomStatus.MAINTENANCE]: [RoomStatus.CLEANING, RoomStatus.AVAILABLE, RoomStatus.OUT_OF_SERVICE],
  [RoomStatus.OUT_OF_SERVICE]: [RoomStatus.MAINTENANCE, RoomStatus.CLEANING],
};

export function canTransitionRoom(from: RoomStatus, to: RoomStatus): boolean {
  if (from === to) return true;
  return ROOM_TRANSITIONS[from].includes(to);
}

export function assertRoomTransition(from: RoomStatus, to: RoomStatus): void {
  if (!canTransitionRoom(from, to)) {
    throw new DomainError(ErrorCode.CONFLICT, `A room cannot move from ${from} to ${to}.`, {
      details: { from, to, allowed: ROOM_TRANSITIONS[from] },
    });
  }
}

/** Statuses in which a room may be assigned to an arriving guest today. */
export const READY_FOR_ARRIVAL: readonly RoomStatus[] = [RoomStatus.AVAILABLE, RoomStatus.RESERVED];

/**
 * Whether a room can be sold at all.
 *
 * A blocked room is withheld deliberately (refurbishment, an owner's stay) and
 * is not sellable even while its operational status reads AVAILABLE.
 */
export function isSellable(
  status: RoomStatus,
  blocked: boolean,
  blockedUntil: Date | null,
  now: Date,
): boolean {
  if (blocked && (blockedUntil === null || blockedUntil > now)) return false;
  return READY_FOR_ARRIVAL.includes(status);
}

/** The status a room lands in after the guest departs. */
export function statusAfterCheckout(): RoomStatus {
  return RoomStatus.CLEANING;
}
