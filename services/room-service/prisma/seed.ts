/**
 * Seeds the room inventory for the demonstration property.
 *
 * `HOTEL_ID` comes from the hotel-service seed output — the services own
 * separate databases, so there is no foreign key to follow and the id has to be
 * passed across deliberately.
 */
import { AmenityCode, RoomTypeCode } from '@staysphere/contracts';
import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

const HOTEL_ID = process.env.SEED_HOTEL_ID ?? 'htl_seaside_demo';

const ROOM_TYPES = [
  {
    code: RoomTypeCode.DOUBLE,
    name: 'Classic Double',
    description: 'Courtyard view, 26 m², queen bed and a compact work nook.',
    maxOccupancy: 2,
    maxAdults: 2,
    maxChildren: 1,
    sizeSquareMetres: 26,
    beds: [{ type: 'QUEEN', count: 1 }],
    amenities: [AmenityCode.WIFI, AmenityCode.AIR_CONDITIONING, AmenityCode.SAFE],
    floors: [1, 2],
    roomsPerFloor: 12,
  },
  {
    code: RoomTypeCode.DELUXE,
    name: 'Deluxe King',
    description: 'Garden-facing, 32 m², walk-in rain shower and a writing desk.',
    maxOccupancy: 2,
    maxAdults: 2,
    maxChildren: 1,
    sizeSquareMetres: 32,
    beds: [{ type: 'KING', count: 1 }],
    amenities: [
      AmenityCode.WIFI,
      AmenityCode.AIR_CONDITIONING,
      AmenityCode.SAFE,
      AmenityCode.BALCONY,
      AmenityCode.MINIBAR,
    ],
    floors: [3, 4],
    roomsPerFloor: 12,
  },
  {
    code: RoomTypeCode.FAMILY,
    name: 'Family Retreat',
    description: 'Two connected bedrooms, a kitchenette and a shaded terrace.',
    maxOccupancy: 5,
    maxAdults: 3,
    maxChildren: 3,
    sizeSquareMetres: 48,
    beds: [
      { type: 'KING', count: 1 },
      { type: 'SINGLE', count: 2 },
    ],
    amenities: [AmenityCode.WIFI, AmenityCode.KITCHENETTE, AmenityCode.BALCONY],
    floors: [5],
    roomsPerFloor: 8,
  },
  {
    code: RoomTypeCode.SUITE,
    name: 'Ocean Suite',
    description: 'Separate living room, private balcony and an uninterrupted sea view.',
    maxOccupancy: 3,
    maxAdults: 3,
    maxChildren: 2,
    sizeSquareMetres: 62,
    beds: [{ type: 'KING', count: 1 }],
    amenities: [
      AmenityCode.WIFI,
      AmenityCode.SEA_VIEW,
      AmenityCode.BALCONY,
      AmenityCode.MINIBAR,
      AmenityCode.SPA,
    ],
    floors: [6],
    roomsPerFloor: 6,
  },
] as const;

async function main(): Promise<void> {
  let roomCount = 0;

  for (const definition of ROOM_TYPES) {
    const roomType = await prisma.roomType.upsert({
      where: { hotelId_code: { hotelId: HOTEL_ID, code: definition.code } },
      update: {},
      create: {
        hotelId: HOTEL_ID,
        code: definition.code,
        name: definition.name,
        description: definition.description,
        maxOccupancy: definition.maxOccupancy,
        maxAdults: definition.maxAdults,
        maxChildren: definition.maxChildren,
        sizeSquareMetres: definition.sizeSquareMetres,
        beds: definition.beds as unknown as object,
        amenities: [...definition.amenities],
      },
    });

    for (const floor of definition.floors) {
      for (let index = 1; index <= definition.roomsPerFloor; index += 1) {
        const roomNumber = `${floor}${String(index).padStart(2, '0')}`;
        await prisma.room.upsert({
          where: { hotelId_roomNumber: { hotelId: HOTEL_ID, roomNumber } },
          update: {},
          create: {
            hotelId: HOTEL_ID,
            roomNumber,
            floor,
            roomTypeId: roomType.id,
            maxOccupancy: definition.maxOccupancy,
            amenities: [...definition.amenities],
          },
        });
        roomCount += 1;
      }
    }
  }

  console.warn(`Seeded ${ROOM_TYPES.length} room types and ${roomCount} rooms for ${HOTEL_ID}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
