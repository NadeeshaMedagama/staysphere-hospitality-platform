/**
 * Seeds a demonstrable property.
 *
 * Idempotent: every write is an upsert keyed on a stable natural key, so
 * running it twice against the same database is a no-op rather than a
 * duplicate. Seeds get run repeatedly during development, and a seed that
 * cannot be re-run is a seed nobody runs.
 */
import { AmenityCode, DEFAULT_HOTEL_POLICY } from '@staysphere/contracts';
import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

const HOTEL_SLUG = 'seaside-grand-colombo';

const AMENITIES = [
  AmenityCode.WIFI,
  AmenityCode.POOL,
  AmenityCode.SPA,
  AmenityCode.GYM,
  AmenityCode.RESTAURANT,
  AmenityCode.BAR,
  AmenityCode.ROOM_SERVICE,
  AmenityCode.LAUNDRY,
  AmenityCode.AIRPORT_SHUTTLE,
  AmenityCode.PARKING,
  AmenityCode.BEACH_ACCESS,
  AmenityCode.ACCESSIBLE,
];

async function main(): Promise<void> {
  const hotel = await prisma.hotel.upsert({
    where: { slug: HOTEL_SLUG },
    update: {},
    create: {
      slug: HOTEL_SLUG,
      name: 'Seaside Grand',
      legalName: 'Seaside Grand Hotels (Pvt) Ltd',
      description:
        'A coastal property on the Galle Face green, with 147 rooms, two restaurants and a spa.',
      status: 'ACTIVE',
      starRating: 5,
      addressLine1: '1 Galle Face Terrace',
      city: 'Colombo',
      region: 'Western Province',
      postalCode: '00300',
      countryCode: 'LK',
      latitude: 6.9271,
      longitude: 79.8412,
      timezone: 'Asia/Colombo',
      email: 'reservations@seasidegrand.example',
      phone: '+94 11 000 0000',
      currency: 'USD',
      policy: { ...DEFAULT_HOTEL_POLICY, checkInFrom: '14:00', checkOutBy: '11:00' },
    },
  });

  for (const code of AMENITIES) {
    await prisma.hotelAmenity.upsert({
      where: { hotelId_code: { hotelId: hotel.id, code } },
      update: {},
      create: { hotelId: hotel.id, code, chargeable: code === AmenityCode.AIRPORT_SHUTTLE },
    });
  }

  await prisma.branch.upsert({
    where: { hotelId_code: { hotelId: hotel.id, code: 'MAIN' } },
    update: {},
    create: {
      hotelId: hotel.id,
      code: 'MAIN',
      name: 'Main building',
      addressLine1: '1 Galle Face Terrace',
      city: 'Colombo',
      countryCode: 'LK',
    },
  });

  console.warn(`Seeded hotel ${hotel.name} (${hotel.id}) with ${AMENITIES.length} amenities`);
  console.warn(`  Use this id when seeding rooms and rates: ${hotel.id}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
