import {
  DomainError,
  ErrorCode,
  INVENTORY_HOLDING_STATUSES,
  SELLABLE_ROOM_STATUSES,
} from '@staysphere/contracts';
import type { BookingStatus, RoomStatus } from '@staysphere/contracts';
import { overlaps, type StayRange } from './date-range.js';

export interface RoomInventory {
  readonly id: string;
  readonly roomNumber: string;
  readonly roomTypeId: string;
  readonly status: RoomStatus;
  readonly maxOccupancy: number;
}

export interface ExistingReservation {
  readonly roomId: string | null;
  readonly roomTypeId: string;
  readonly status: BookingStatus;
  readonly checkIn: Date;
  readonly checkOut: Date;
}

export interface AvailabilityRequest {
  readonly range: StayRange;
  readonly roomTypeId: string;
  readonly guests: number;
  /** Excluded from conflict checks when re-dating an existing reservation. */
  readonly excludeBookingId?: string;
}

export interface AvailabilityResult {
  readonly available: boolean;
  readonly candidates: readonly RoomInventory[];
  readonly totalRooms: number;
}

/**
 * Rooms of the requested type that are free for the whole stay.
 *
 * Reservations only block a room while they hold inventory — a cancelled or
 * no-show booking must not keep a sellable room off the market.
 */
export function findAvailableRooms(
  rooms: readonly RoomInventory[],
  reservations: readonly ExistingReservation[],
  request: AvailabilityRequest,
): AvailabilityResult {
  const ofType = rooms.filter((room) => room.roomTypeId === request.roomTypeId);

  const blocking = reservations.filter(
    (reservation) =>
      INVENTORY_HOLDING_STATUSES.includes(reservation.status) &&
      overlaps(reservation, request.range),
  );
  const blockedRoomIds = new Set(
    blocking.map((reservation) => reservation.roomId).filter((id): id is string => id !== null),
  );

  const candidates = ofType.filter(
    (room) =>
      SELLABLE_ROOM_STATUSES.includes(room.status) &&
      !blockedRoomIds.has(room.id) &&
      room.maxOccupancy >= request.guests,
  );

  return { available: candidates.length > 0, candidates, totalRooms: ofType.length };
}

/**
 * Picks the room to sell.
 *
 * Lowest room number wins — a deterministic rule keeps allocation reproducible
 * in tests and keeps occupied rooms clustered on low floors, which is what
 * housekeeping and front desk actually prefer.
 */
export function allocateRoom(
  rooms: readonly RoomInventory[],
  reservations: readonly ExistingReservation[],
  request: AvailabilityRequest,
): RoomInventory {
  const result = findAvailableRooms(rooms, reservations, request);

  if (result.totalRooms === 0) {
    throw new DomainError(
      ErrorCode.NOT_FOUND,
      'No rooms of the requested type exist at this property.',
      { details: { roomTypeId: request.roomTypeId } },
    );
  }

  if (!result.available) {
    const fitsOccupancy = rooms.some(
      (room) => room.roomTypeId === request.roomTypeId && room.maxOccupancy >= request.guests,
    );
    if (!fitsOccupancy) {
      throw new DomainError(
        ErrorCode.OCCUPANCY_EXCEEDED,
        `No room of this type accommodates ${request.guests} guests.`,
        { details: { guests: request.guests } },
      );
    }
    throw new DomainError(
      ErrorCode.ROOM_TYPE_SOLD_OUT,
      'This room type is sold out for the selected dates.',
      {
        details: {
          roomTypeId: request.roomTypeId,
          checkIn: request.range.checkIn.toISOString(),
          checkOut: request.range.checkOut.toISOString(),
        },
      },
    );
  }

  return [...result.candidates].sort((a, b) =>
    a.roomNumber.localeCompare(b.roomNumber, 'en', { numeric: true }),
  )[0] as RoomInventory;
}
