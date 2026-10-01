/**
 * Seeds booking-service's local read models.
 *
 * In a running platform these rows arrive as `inventory.room-upserted` and
 * `pricing.rate-plan-published` events and are written by the consumer. This
 * seed writes the same rows directly so the booking path is usable before the
 * broker is up — which is what makes `pnpm dev` without Kafka a working
 * environment rather than a half-dead one.
 *
 * The source data is passed in rather than read from another service's
 * database: services do not read each other's tables, and a seed is not an
 * exception to that.
 */
import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

const HOTEL_ID = process.env.SEED_HOTEL_ID ?? 'htl_seaside_demo';

interface RoomSeed {
  readonly id: string;
  readonly roomNumber: string;
  readonly roomTypeId: string;
  readonly floor: number;
  readonly maxOccupancy: number;
}

/** `SEED_ROOMS` and `SEED_RATE_PLANS` are JSON produced by the bootstrap script. */
function parse<T>(variable: string): T[] {
  const raw = process.env[variable];
  if (!raw) return [];
  return JSON.parse(raw) as T[];
}

interface RatePlanSeed {
  readonly roomTypeId: string;
  readonly currency: string;
  readonly baseRateMinor: number;
  readonly weekendMultiplier: number;
  readonly taxBasisPoints: number;
  readonly seasonalRates: unknown;
  readonly longStayDiscounts: unknown;
}

async function main(): Promise<void> {
  const rooms = parse<RoomSeed>('SEED_ROOMS');
  const ratePlans = parse<RatePlanSeed>('SEED_RATE_PLANS');

  if (rooms.length === 0 || ratePlans.length === 0) {
    throw new Error(
      'SEED_ROOMS and SEED_RATE_PLANS must be set. Run scripts/bootstrap-local.sh rather than this seed directly.',
    );
  }

  for (const room of rooms) {
    await prisma.roomProjection.upsert({
      where: { id: room.id },
      update: {
        hotelId: HOTEL_ID,
        roomNumber: room.roomNumber,
        roomTypeId: room.roomTypeId,
        floor: room.floor,
        maxOccupancy: room.maxOccupancy,
      },
      create: {
        id: room.id,
        hotelId: HOTEL_ID,
        roomNumber: room.roomNumber,
        roomTypeId: room.roomTypeId,
        floor: room.floor,
        maxOccupancy: room.maxOccupancy,
        status: 'AVAILABLE',
      },
    });
  }

  for (const plan of ratePlans) {
    await prisma.ratePlanProjection.upsert({
      where: { hotelId_roomTypeId: { hotelId: HOTEL_ID, roomTypeId: plan.roomTypeId } },
      update: {
        currency: plan.currency,
        baseRateMinor: plan.baseRateMinor,
        weekendMultiplier: plan.weekendMultiplier,
        taxBasisPoints: plan.taxBasisPoints,
        seasonalRates: plan.seasonalRates as object,
        longStayDiscounts: plan.longStayDiscounts as object,
      },
      create: {
        id: `rpp_${plan.roomTypeId.toLowerCase()}`,
        hotelId: HOTEL_ID,
        roomTypeId: plan.roomTypeId,
        currency: plan.currency,
        baseRateMinor: plan.baseRateMinor,
        weekendMultiplier: plan.weekendMultiplier,
        taxBasisPoints: plan.taxBasisPoints,
        seasonalRates: plan.seasonalRates as object,
        longStayDiscounts: plan.longStayDiscounts as object,
      },
    });
  }

  console.warn(
    `Projected ${rooms.length} rooms and ${ratePlans.length} rate plans for ${HOTEL_ID}`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
