import { BookingStatus, ErrorCode, RoomStatus } from '@staysphere/contracts';
import {
  allocateRoom,
  findAvailableRooms,
  type ExistingReservation,
  type RoomInventory,
} from './availability';

const d = (iso: string) => new Date(iso);
const range = { checkIn: d('2026-10-01'), checkOut: d('2026-10-04') };

const rooms: RoomInventory[] = [
  {
    id: 'r102',
    roomNumber: '102',
    roomTypeId: 'deluxe',
    status: RoomStatus.AVAILABLE,
    maxOccupancy: 2,
  },
  {
    id: 'r101',
    roomNumber: '101',
    roomTypeId: 'deluxe',
    status: RoomStatus.AVAILABLE,
    maxOccupancy: 2,
  },
  {
    id: 'r103',
    roomNumber: '103',
    roomTypeId: 'deluxe',
    status: RoomStatus.MAINTENANCE,
    maxOccupancy: 2,
  },
  {
    id: 'r201',
    roomNumber: '201',
    roomTypeId: 'suite',
    status: RoomStatus.AVAILABLE,
    maxOccupancy: 4,
  },
];

const request = { range, roomTypeId: 'deluxe', guests: 2 };

function booking(overrides: Partial<ExistingReservation>): ExistingReservation {
  return {
    roomId: 'r101',
    roomTypeId: 'deluxe',
    status: BookingStatus.CONFIRMED,
    checkIn: d('2026-10-01'),
    checkOut: d('2026-10-04'),
    ...overrides,
  };
}

describe('findAvailableRooms', () => {
  it('returns every sellable room of the requested type when nothing is booked', () => {
    const result = findAvailableRooms(rooms, [], request);
    expect(result.available).toBe(true);
    expect(result.candidates.map((r) => r.id).sort()).toEqual(['r101', 'r102']);
    expect(result.totalRooms).toBe(3);
  });

  it('excludes rooms under maintenance', () => {
    expect(findAvailableRooms(rooms, [], request).candidates.map((r) => r.id)).not.toContain(
      'r103',
    );
  });

  it('excludes a room held by an overlapping confirmed booking', () => {
    const result = findAvailableRooms(rooms, [booking({})], request);
    expect(result.candidates.map((r) => r.id)).toEqual(['r102']);
  });

  it('ignores a cancelled booking — it must not keep a room off the market', () => {
    const result = findAvailableRooms(
      rooms,
      [booking({ status: BookingStatus.CANCELLED })],
      request,
    );
    expect(result.candidates.map((r) => r.id).sort()).toEqual(['r101', 'r102']);
  });

  it('ignores a no-show booking', () => {
    const result = findAvailableRooms(rooms, [booking({ status: BookingStatus.NO_SHOW })], request);
    expect(result.candidates).toHaveLength(2);
  });

  it('treats a pending booking as holding inventory', () => {
    const result = findAvailableRooms(rooms, [booking({ status: BookingStatus.PENDING })], request);
    expect(result.candidates.map((r) => r.id)).toEqual(['r102']);
  });

  it('ignores a booking for non-overlapping dates', () => {
    const earlier = booking({ checkIn: d('2026-09-20'), checkOut: d('2026-09-25') });
    expect(findAvailableRooms(rooms, [earlier], request).candidates).toHaveLength(2);
  });

  it('permits a same-day turnover on the departure date', () => {
    const departing = booking({ checkIn: d('2026-09-28'), checkOut: d('2026-10-01') });
    expect(findAvailableRooms(rooms, [departing], request).candidates).toHaveLength(2);
  });

  it('excludes rooms too small for the party', () => {
    const result = findAvailableRooms(rooms, [], { ...request, guests: 3 });
    expect(result.available).toBe(false);
  });
});

describe('allocateRoom', () => {
  it('picks the lowest room number for deterministic allocation', () => {
    expect(allocateRoom(rooms, [], request).roomNumber).toBe('101');
  });

  it('sorts numerically, not lexicographically', () => {
    const wide: RoomInventory[] = [
      {
        id: 'a',
        roomNumber: '1001',
        roomTypeId: 'deluxe',
        status: RoomStatus.AVAILABLE,
        maxOccupancy: 2,
      },
      {
        id: 'b',
        roomNumber: '205',
        roomTypeId: 'deluxe',
        status: RoomStatus.AVAILABLE,
        maxOccupancy: 2,
      },
    ];
    expect(allocateRoom(wide, [], request).roomNumber).toBe('205');
  });

  it('falls through to the next free room when the first is held', () => {
    expect(allocateRoom(rooms, [booking({})], request).roomNumber).toBe('102');
  });

  it('reports the room type as sold out when every room is held', () => {
    const all = [booking({ roomId: 'r101' }), booking({ roomId: 'r102' })];
    expect(() => allocateRoom(rooms, all, request)).toThrow(
      expect.objectContaining({ code: ErrorCode.ROOM_TYPE_SOLD_OUT }),
    );
  });

  it('distinguishes an occupancy problem from a sold-out one', () => {
    expect(() => allocateRoom(rooms, [], { ...request, guests: 3 })).toThrow(
      expect.objectContaining({ code: ErrorCode.OCCUPANCY_EXCEEDED }),
    );
  });

  it('reports NOT_FOUND when the property has no such room type', () => {
    expect(() => allocateRoom(rooms, [], { ...request, roomTypeId: 'penthouse' })).toThrow(
      expect.objectContaining({ code: ErrorCode.NOT_FOUND }),
    );
  });
});
