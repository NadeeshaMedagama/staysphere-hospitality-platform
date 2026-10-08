/**
 * Interactive-transaction budget for every service's Prisma client.
 *
 * Prisma defaults to a five-second interactive transaction. That is generous
 * against a database on the same host and far too tight against a hosted one:
 * every statement inside `$transaction` is a separate round trip, so a
 * transaction that writes a row and then appends an outbox event costs two
 * round trips before it has done anything interesting. Against Neon in another
 * region, five or six of those exhaust the default budget and Prisma aborts
 * with P2028 — a 500 that appears only when the database is far away, which is
 * to say only in production.
 *
 * Twenty seconds is not permission to hold a transaction open: locks are still
 * held for its duration and a slow transaction is still a bug. It is the margin
 * that stops network latency alone from turning correct code into an outage.
 */
export const PRISMA_TRANSACTION_OPTIONS = {
  /** How long to wait for a connection from the pool before giving up. */
  maxWait: numberFromEnv('PRISMA_TX_MAX_WAIT_MS', 10_000),
  /** How long a transaction may stay open once it has started. */
  timeout: numberFromEnv('PRISMA_TX_TIMEOUT_MS', 20_000),
} as const;

function numberFromEnv(key: string, fallback: number): number {
  const parsed = Number(process.env[key]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
