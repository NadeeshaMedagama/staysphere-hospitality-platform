/**
 * Seeds one account per role for local development.
 *
 * Every account shares the same development password, and the seed refuses to
 * run outside development — seeding a known credential into a live database is
 * how a demonstration environment becomes an incident.
 */
import { hash } from '@node-rs/argon2';
import { Role } from '@staysphere/contracts';
import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

const DEV_PASSWORD = 'StaySphere-Dev-2026!';
const HOTEL_ID = process.env.SEED_HOTEL_ID ?? 'htl_seaside_demo';

const ACCOUNTS = [
  {
    email: 'admin@staysphere.local',
    fullName: 'Platform Administrator',
    roles: [Role.SUPER_ADMIN],
    scoped: false,
  },
  {
    email: 'manager@staysphere.local',
    fullName: 'Duty Manager',
    roles: [Role.MANAGER],
    scoped: true,
  },
  {
    email: 'reception@staysphere.local',
    fullName: 'Front Desk',
    roles: [Role.RECEPTIONIST],
    scoped: true,
  },
  {
    email: 'housekeeping@staysphere.local',
    fullName: 'A. Perera',
    roles: [Role.HOUSEKEEPING],
    scoped: true,
  },
  {
    email: 'maintenance@staysphere.local',
    fullName: 'S. Fernando',
    roles: [Role.MAINTENANCE],
    scoped: true,
  },
  {
    email: 'finance@staysphere.local',
    fullName: 'Finance Officer',
    roles: [Role.FINANCE],
    scoped: true,
  },
  { email: 'guest@example.com', fullName: 'Test Guest', roles: [Role.CUSTOMER], scoped: false },
] as const;

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed known credentials into a production database.');
  }

  const passwordHash = await hash(DEV_PASSWORD, {
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

  for (const account of ACCOUNTS) {
    await prisma.user.upsert({
      where: { email: account.email },
      update: {},
      create: {
        email: account.email,
        passwordHash,
        fullName: account.fullName,
        roles: [...account.roles],
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        hotelId: account.scoped ? HOTEL_ID : null,
      },
    });
  }

  console.warn(`Seeded ${ACCOUNTS.length} accounts. Password for all of them: ${DEV_PASSWORD}`);
  for (const account of ACCOUNTS) {
    console.warn(`  ${account.email.padEnd(32)} ${account.roles.join(', ')}`);
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
