import { ErrorCode, RoomStatus } from '@staysphere/contracts';
import {
  ROOM_TRANSITIONS,
  assertRoomTransition,
  canTransitionRoom,
  isSellable,
  statusAfterCheckout,
} from './room-status';

describe('room status machine', () => {
  it('follows the normal sale cycle', () => {
    expect(canTransitionRoom(RoomStatus.AVAILABLE, RoomStatus.RESERVED)).toBe(true);
    expect(canTransitionRoom(RoomStatus.RESERVED, RoomStatus.OCCUPIED)).toBe(true);
    expect(canTransitionRoom(RoomStatus.OCCUPIED, RoomStatus.CLEANING)).toBe(true);
    expect(canTransitionRoom(RoomStatus.CLEANING, RoomStatus.AVAILABLE)).toBe(true);
  });

  it('treats a no-op transition as allowed', () => {
    expect(canTransitionRoom(RoomStatus.AVAILABLE, RoomStatus.AVAILABLE)).toBe(true);
  });

  it('refuses to take an occupied room out of service', () => {
    // The guest has to be moved first — that is a front-desk decision.
    expect(canTransitionRoom(RoomStatus.OCCUPIED, RoomStatus.MAINTENANCE)).toBe(false);
    expect(canTransitionRoom(RoomStatus.OCCUPIED, RoomStatus.OUT_OF_SERVICE)).toBe(false);
    expect(canTransitionRoom(RoomStatus.OCCUPIED, RoomStatus.RESERVED)).toBe(false);
  });

  it('allows a fault to be raised from any unoccupied state', () => {
    for (const from of [RoomStatus.AVAILABLE, RoomStatus.RESERVED, RoomStatus.CLEANING]) {
      expect(canTransitionRoom(from, RoomStatus.MAINTENANCE)).toBe(true);
    }
  });

  it('never sends a room straight from out of service back to sale', () => {
    // It has to be repaired and cleaned first.
    expect(canTransitionRoom(RoomStatus.OUT_OF_SERVICE, RoomStatus.AVAILABLE)).toBe(false);
    expect(canTransitionRoom(RoomStatus.OUT_OF_SERVICE, RoomStatus.CLEANING)).toBe(true);
  });

  it('throws with the allowed set when a transition is rejected', () => {
    expect.assertions(2);
    try {
      assertRoomTransition(RoomStatus.OCCUPIED, RoomStatus.MAINTENANCE);
    } catch (error) {
      const domainError = error as { code: string; details?: { allowed: RoomStatus[] } };
      expect(domainError.code).toBe(ErrorCode.CONFLICT);
      expect(domainError.details?.allowed).toEqual(ROOM_TRANSITIONS[RoomStatus.OCCUPIED]);
    }
  });

  it('sends a departed room to cleaning', () => {
    expect(statusAfterCheckout()).toBe(RoomStatus.CLEANING);
  });

  it('defines transitions for every status', () => {
    for (const status of Object.values(RoomStatus)) {
      expect(ROOM_TRANSITIONS[status]).toBeDefined();
    }
  });
});

describe('isSellable', () => {
  const now = new Date('2026-09-09T10:00:00Z');

  it('sells an available, unblocked room', () => {
    expect(isSellable(RoomStatus.AVAILABLE, false, null, now)).toBe(true);
  });

  it('still sells a reserved room — it is held, not sold out', () => {
    expect(isSellable(RoomStatus.RESERVED, false, null, now)).toBe(true);
  });

  it('does not sell a room being cleaned or repaired', () => {
    expect(isSellable(RoomStatus.CLEANING, false, null, now)).toBe(false);
    expect(isSellable(RoomStatus.MAINTENANCE, false, null, now)).toBe(false);
    expect(isSellable(RoomStatus.OCCUPIED, false, null, now)).toBe(false);
  });

  it('withholds a blocked room even when its status reads available', () => {
    expect(isSellable(RoomStatus.AVAILABLE, true, null, now)).toBe(false);
  });

  it('returns a room to sale once its block has expired', () => {
    const expired = new Date('2026-09-08T10:00:00Z');
    expect(isSellable(RoomStatus.AVAILABLE, true, expired, now)).toBe(true);
  });

  it('keeps a room withheld while the block is still running', () => {
    const future = new Date('2026-09-20T10:00:00Z');
    expect(isSellable(RoomStatus.AVAILABLE, true, future, now)).toBe(false);
  });
});
