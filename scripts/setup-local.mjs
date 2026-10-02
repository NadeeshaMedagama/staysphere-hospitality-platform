#!/usr/bin/env node
/**
 * Prepares this machine to run StaySphere without Docker.
 *
 *   pnpm setup:local
 *
 * Creates one database per service, then writes the .env files each service
 * reads at boot. Nothing else in the platform needs a container: Redis and
 * Kafka are optional in the environment schema, and the Next.js applications
 * have no external dependency at all.
 *
 * Point it at any PostgreSQL — a native install, a container, or Neon:
 *
 *   DATABASE_ADMIN_URL=postgresql://user:pass@host:5432/postgres pnpm setup:local
 *
 * Idempotent: existing databases are left alone and existing .env files are
 * never overwritten, so secrets you have edited survive a re-run.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { userInfo } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import pg from 'pg';

/** Service directory → the database it owns. Database per service, always. */
const SERVICES = {
  'api-gateway': null, // holds no data of its own
  'auth-service': 'staysphere_auth',
  'booking-service': 'staysphere_booking',
  'hotel-service': 'staysphere_hotel',
  'room-service': 'staysphere_room',
  'pricing-service': 'staysphere_pricing',
  'payment-service': 'staysphere_payment',
  'stay-service': 'staysphere_stay',
  'finance-service': 'staysphere_finance',
  'housekeeping-service': 'staysphere_housekeeping',
  'maintenance-service': 'staysphere_maintenance',
  'notification-service': 'staysphere_notification',
  'review-service': 'staysphere_review',
  'reporting-service': 'staysphere_reporting',
  'audit-service': 'staysphere_audit',
};

const PORTS = {
  'api-gateway': 3000,
  'auth-service': 3001,
  'booking-service': 3002,
  'hotel-service': 3003,
  'room-service': 3004,
  'pricing-service': 3005,
  'payment-service': 3006,
  'stay-service': 3007,
  'finance-service': 3008,
  'housekeeping-service': 3009,
  'maintenance-service': 3010,
  'notification-service': 3011,
  'review-service': 3012,
  'reporting-service': 3013,
  'audit-service': 3014,
};

const adminUrl =
  process.env.DATABASE_ADMIN_URL ??
  `postgresql://${encodeURIComponent(userInfo().username)}@localhost:5432/postgres`;

/**
 * Neon publishes two endpoints for the same branch: a pooled one (`-pooler` in
 * the host) that the running service should use, and a direct one for anything
 * the pooler cannot carry.
 *
 * Two operations need the direct endpoint. `CREATE DATABASE` cannot run inside
 * the transaction PgBouncer wraps every statement in, and Prisma Migrate takes
 * advisory locks the pooler does not forward. Everything else — the whole
 * request path — goes through the pooler, which is the point of having it.
 *
 * Anywhere else, both are the same connection.
 */
const isPooled = new URL(adminUrl).hostname.includes('-pooler.');
const directAdminUrl = isPooled ? adminUrl.replace('-pooler.', '.') : adminUrl;
const pooledAdminUrl = adminUrl;

/**
 * Prisma opens `num_cpus * 2 + 1` connections per client by default. Across
 * fourteen services that is several hundred against one branch, so the pooled
 * URL carries an explicit, modest limit.
 */
const POOL_SETTINGS = { connection_limit: '5', pool_timeout: '20' };

const secret = () => randomBytes(36).toString('base64url');

function dsnFor(base, database, extra = {}) {
  const url = new URL(base);
  url.pathname = `/${database}`;
  for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, value);
  return url.toString();
}

async function createDatabases() {
  // CREATE DATABASE cannot run through a transaction pooler.
  const client = new pg.Client({ connectionString: directAdminUrl });

  try {
    await client.connect();
  } catch (error) {
    console.error(`\n✗ Could not connect to PostgreSQL at ${redact(adminUrl)}\n`);
    console.error(`  ${error instanceof Error ? error.message : String(error)}\n`);
    console.error('  Point the script at your own server:');
    console.error('    DATABASE_ADMIN_URL=postgresql://user:password@host:5432/postgres pnpm setup:local\n');
    console.error('  Or start one in a container:');
    console.error('    docker run -d --name staysphere-pg -p 5432:5432 \\');
    console.error('      -e POSTGRES_PASSWORD=staysphere -e POSTGRES_USER=staysphere postgres:17-alpine\n');
    process.exit(1);
  }

  console.log(`▸ PostgreSQL at ${redact(directAdminUrl)}`);
  if (isPooled) {
    console.log('  Pooled endpoint detected: services will use it, migrations will not.');
  }
  let created = 0;

  for (const database of Object.values(SERVICES)) {
    if (!database) continue;
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      database,
    ]);
    if (rowCount > 0) {
      console.log(`  · ${database} (exists)`);
      continue;
    }
    // Identifiers cannot be parameterised; every name here is a literal from
    // the table above, never user input.
    await client.query(`CREATE DATABASE "${database}"`);
    console.log(`  ✓ ${database} (created)`);
    created += 1;
  }

  await client.end();
  return created;
}

function writeEnvFiles() {
  const shared = {
    NODE_ENV: 'development',
    LOG_LEVEL: 'debug',
    JWT_ACCESS_SECRET: secret(),
    JWT_REFRESH_SECRET: secret(),
    JWT_ISSUER: 'staysphere.auth',
    JWT_AUDIENCE: 'staysphere.api',
    CORS_ORIGINS: 'http://localhost:3100,http://localhost:3200,http://localhost:3300',
  };

  // One shared secret across services, or a token minted by auth-service would
  // not verify anywhere else.
  const rootEnvPath = '.env';
  let rootEnv = {};
  if (existsSync(rootEnvPath)) {
    rootEnv = parseEnv(readFileSync(rootEnvPath, 'utf8'));
    console.log('\n▸ Reusing the secrets already in .env');
  } else {
    rootEnv = { ...shared };
    writeFileSync(
      rootEnvPath,
      [
        '# Generated by `pnpm setup:local`. Safe to edit; re-running will not overwrite it.',
        '# These are development secrets. Never reuse them anywhere real.',
        '',
        ...Object.entries(rootEnv).map(([key, value]) => `${key}=${value}`),
        '',
      ].join('\n'),
    );
    console.log('\n▸ Wrote .env with freshly generated development secrets');
  }

  const accessSecret = rootEnv.JWT_ACCESS_SECRET ?? shared.JWT_ACCESS_SECRET;
  const refreshSecret = rootEnv.JWT_REFRESH_SECRET ?? shared.JWT_REFRESH_SECRET;

  let written = 0;
  let skipped = 0;

  for (const [service, database] of Object.entries(SERVICES)) {
    const dir = join('services', service);
    if (!existsSync(dir)) continue;

    const path = join(dir, '.env');
    if (existsSync(path)) {
      skipped += 1;
      continue;
    }

    const lines = [
      `# Generated by \`pnpm setup:local\` for ${service}.`,
      '# Loaded by the dev script only; deployed environments inject these directly.',
      '',
      'NODE_ENV=development',
      'LOG_LEVEL=debug',
      `SERVICE_NAME=${service}`,
      `PORT=${PORTS[service]}`,
      '',
      `JWT_ACCESS_SECRET=${accessSecret}`,
      ...(service === 'auth-service' ? [`JWT_REFRESH_SECRET=${refreshSecret}`] : []),
      'JWT_ISSUER=staysphere.auth',
      'JWT_AUDIENCE=staysphere.api',
      `CORS_ORIGINS=${shared.CORS_ORIGINS}`,
      '',
      ...(service === 'api-gateway'
        ? [
            '# The production default is 120 requests a minute per IP, which assumes',
            '# one IP is roughly one user. On a developer machine every front end,',
            '# every server-rendered page and the whole end-to-end suite arrive from',
            '# 127.0.0.1, so they share a single bucket and the limit stops being',
            '# abuse protection and becomes a cap on local work. Deployed',
            '# environments inject their own value and never read this file.',
            'RATE_LIMIT_MAX=5000',
            'RATE_LIMIT_TTL_SECONDS=60',
            '',
          ]
        : []),
    ];

    if (database) {
      lines.push(
        '# This service owns this database and no other service reads it.',
        `DATABASE_URL=${dsnFor(pooledAdminUrl, database, POOL_SETTINGS)}`,
        '# Prisma Migrate takes advisory locks a transaction pooler does not',
        '# forward, so it needs the direct endpoint. Identical to the above',
        '# anywhere that has no pooler.',
        `DIRECT_URL=${dsnFor(directAdminUrl, database)}`,
        '',
      );
    }

    if (service === 'api-gateway') {
      lines.push(
        '# Upstreams. Any left unset makes the gateway answer UPSTREAM_UNAVAILABLE',
        '# for those routes rather than failing to start, so a partial stack works.',
        ...Object.entries(PORTS)
          .filter(([name]) => name !== 'api-gateway')
          .map(([name, port]) => `${name.replace('-service', '').toUpperCase()}_SERVICE_URL=http://127.0.0.1:${port}`),
        '',
        '# Higher than the 10s default because a local stack usually talks to a',
        '# hosted database in another region. A write that touches several tables',
        '# is several sequential round trips, and at 300ms each the edge gives up',
        '# while the upstream is still committing — the caller sees 504 for work',
        '# that succeeded. Production, with the database in the same region, wants',
        '# the tighter default.',
        'UPSTREAM_TIMEOUT_MS=30000',
        '',
      );
    }

    mkdirSync(dir, { recursive: true });
    writeFileSync(path, lines.join('\n'));
    written += 1;
  }

  return { written, skipped };
}

function parseEnv(contents) {
  const result = {};
  for (const line of contents.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    result[trimmed.slice(0, index)] = trimmed.slice(index + 1);
  }
  return result;
}

function redact(url) {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = '***';
    return parsed.toString();
  } catch {
    return url;
  }
}

const created = await createDatabases();
const { written, skipped } = writeEnvFiles();

console.log(`  ${written} service .env file(s) written${skipped > 0 ? `, ${skipped} left untouched` : ''}`);
console.log(`\n✓ Ready. ${created} database(s) created.\n`);
console.log('  Next:');
console.log('    pnpm db:generate     # generate the Prisma clients');
console.log('    pnpm db:migrate      # apply the schema');
console.log('    pnpm db:seed         # a demo property, rooms, rates and one account per role');
console.log('    pnpm dev             # every service and app, in watch mode\n');
