#!/usr/bin/env node
/**
 * Seeds every local database in the order the data actually depends on.
 *
 *   pnpm db:seed
 *
 * Ordering matters and turbo cannot express it: the hotel is created first, and
 * its id is then passed to the services that reference it. Services own separate
 * databases, so nothing can look that id up for itself — it has to be handed
 * across deliberately, which is exactly the constraint the platform runs under.
 *
 * Reads each service's own .env, so it needs no psql and no container.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import pg from 'pg';

function envFor(service) {
  const path = join('services', service, '.env');
  if (!existsSync(path)) {
    console.error(`\n✗ services/${service}/.env is missing. Run \`pnpm setup:local\` first.\n`);
    process.exit(1);
  }
  const result = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index !== -1) result[trimmed.slice(0, index)] = trimmed.slice(index + 1);
  }
  return result;
}

function seed(service, extra = {}) {
  process.stdout.write(`  ${service.padEnd(20)}`);
  const result = spawnSync('pnpm', ['--filter', `@staysphere/${service}`, 'run', 'db:seed'], {
    env: { ...process.env, ...extra },
    encoding: 'utf8',
  });

  // The seeds report through console.warn to satisfy the no-console lint rule,
  // so their output arrives on stderr. Both streams are searched.
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;

  if (result.status !== 0) {
    console.log('FAILED');
    console.error(`\n${output}`);
    process.exit(1);
  }

  console.log('seeded');
  return output;
}

async function query(service, sql) {
  const client = new pg.Client({ connectionString: envFor(service).DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query(sql);
    return rows;
  } finally {
    await client.end();
  }
}

console.log('▸ Seeding');

// 1. The property. Everything else references its id.
const hotelOutput = seed('hotel-service');
const hotelId = /seeding rooms and rates:\s*(\S+)/.exec(hotelOutput)?.[1];
if (!hotelId) {
  console.error('\n✗ Could not read the seeded hotel id from the hotel-service output.\n');
  process.exit(1);
}
console.log(`  ${'hotel id'.padEnd(20)}${hotelId}`);

// 2. Inventory, rates and accounts, all scoped to that property.
for (const service of ['room-service', 'pricing-service', 'auth-service']) {
  seed(service, { SEED_HOTEL_ID: hotelId });
}

// 3. booking-service keeps local read models of rooms and rates. In a running
//    platform these arrive as events; without the broker up, the seeder hands
//    them over directly — reading the owning databases *here*, in the tool,
//    never from the service itself.
const rooms = await query(
  'room-service',
  `SELECT r.id, r."roomNumber", t.code AS "roomTypeId", r.floor, r."maxOccupancy"
     FROM rooms r JOIN room_types t ON t.id = r."roomTypeId"`,
);
const rates = await query(
  'pricing-service',
  `SELECT p."roomTypeId", p.currency, p."baseRateMinor",
          p."weekendMultiplier"::float8 AS "weekendMultiplier", p."taxBasisPoints",
          coalesce((SELECT json_agg(json_build_object('label', s.label, 'from', s."startsOn",
                     'to', s."endsOn", 'nightlyRateMinor', s."nightlyRateMinor"))
                    FROM seasonal_rates s WHERE s."ratePlanId" = p.id), '[]'::json) AS "seasonalRates",
          coalesce((SELECT json_agg(json_build_object('minNights', d."minNights",
                     'percentOff', d."basisPoints"::float8 / 10000))
                    FROM long_stay_discounts d WHERE d."ratePlanId" = p.id), '[]'::json) AS "longStayDiscounts"
     FROM rate_plans p WHERE p.published`,
);

seed('booking-service', {
  SEED_HOTEL_ID: hotelId,
  SEED_ROOMS: JSON.stringify(rooms),
  SEED_RATE_PLANS: JSON.stringify(rates),
});

console.log(`\n✓ Seeded ${rooms.length} rooms and ${rates.length} published rate plans.`);
console.log(`  Hotel id: ${hotelId}`);
console.log('  Sign in with any seeded account and the password StaySphere-Dev-2026!\n');
console.log('    admin@staysphere.local         SUPER_ADMIN');
console.log('    manager@staysphere.local       MANAGER');
console.log('    reception@staysphere.local     RECEPTIONIST');
console.log('    housekeeping@staysphere.local  HOUSEKEEPING');
console.log('    maintenance@staysphere.local   MAINTENANCE');
console.log('    finance@staysphere.local       FINANCE');
console.log('    guest@example.com              CUSTOMER\n');
