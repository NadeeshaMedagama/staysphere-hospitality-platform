/**
 * Seeds published rate plans for the demonstration property.
 *
 * Rates are the reason a booking has a price at all: without a published plan
 * the availability endpoint returns NOT_FOUND, so this seed is what makes the
 * guest journey work end to end.
 */
import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

const HOTEL_ID = process.env.SEED_HOTEL_ID ?? 'htl_seaside_demo';

const PLANS = [
  {
    roomTypeId: 'DOUBLE',
    name: 'Classic Double — standard',
    baseRateMinor: 8_900,
    min: 6_500,
    max: 18_000,
  },
  {
    roomTypeId: 'DELUXE',
    name: 'Deluxe King — standard',
    baseRateMinor: 12_000,
    min: 9_000,
    max: 26_000,
  },
  {
    roomTypeId: 'FAMILY',
    name: 'Family Retreat — standard',
    baseRateMinor: 19_000,
    min: 14_000,
    max: 38_000,
  },
  {
    roomTypeId: 'SUITE',
    name: 'Ocean Suite — standard',
    baseRateMinor: 24_500,
    min: 18_000,
    max: 52_000,
  },
] as const;

const EFFECTIVE_FROM = new Date('2026-01-01T00:00:00.000Z');

const SEASONS = [
  { label: 'Peak season', startsOn: '2026-12-15', endsOn: '2027-01-10', multiplier: 1.6 },
  { label: 'Monsoon', startsOn: '2026-05-15', endsOn: '2026-08-31', multiplier: 0.8 },
];

async function main(): Promise<void> {
  for (const plan of PLANS) {
    const created = await prisma.ratePlan.upsert({
      where: {
        hotelId_roomTypeId_effectiveFrom: {
          hotelId: HOTEL_ID,
          roomTypeId: plan.roomTypeId,
          effectiveFrom: EFFECTIVE_FROM,
        },
      },
      update: { published: true },
      create: {
        hotelId: HOTEL_ID,
        roomTypeId: plan.roomTypeId,
        name: plan.name,
        currency: 'USD',
        baseRateMinor: plan.baseRateMinor,
        weekendMultiplier: 1.2,
        taxBasisPoints: 1250,
        minRateMinor: plan.min,
        maxRateMinor: plan.max,
        effectiveFrom: EFFECTIVE_FROM,
        published: true,
        stayDiscounts: {
          create: [
            { minNights: 7, basisPoints: 1000 },
            { minNights: 14, basisPoints: 2000 },
          ],
        },
        seasons: {
          create: SEASONS.map((season) => ({
            label: season.label,
            startsOn: new Date(`${season.startsOn}T00:00:00.000Z`),
            endsOn: new Date(`${season.endsOn}T00:00:00.000Z`),
            nightlyRateMinor: Math.round(plan.baseRateMinor * season.multiplier),
          })),
        },
      },
    });
    console.warn(`  ${plan.name}: ${created.id}`);
  }

  await prisma.promotion.upsert({
    where: { code: 'SUMMER25' },
    update: {},
    create: {
      code: 'SUMMER25',
      name: 'Summer 25%',
      description: 'Twenty-five per cent off stays of two nights or more.',
      type: 'PERCENTAGE',
      value: 2500,
      validFrom: new Date('2026-06-01T00:00:00.000Z'),
      validTo: new Date('2026-09-30T23:59:59.000Z'),
      minNights: 2,
      minSpendMinor: 10_000,
      maxRedemptions: 500,
      maxPerCustomer: 1,
    },
  });

  console.warn(`Seeded ${PLANS.length} published rate plans and 1 promotion for ${HOTEL_ID}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
