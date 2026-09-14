import { withRetry } from './retry.js';

/** Prisma's code for "the database server could not be reached at all". */
const UNREACHABLE_CODES = new Set(['P1001', 'P1002', 'P1017']);

function isReachabilityError(error: unknown): boolean {
  const code = (error as { errorCode?: string; code?: string } | null)?.errorCode
    ?? (error as { code?: string } | null)?.code;
  return typeof code === 'string' && UNREACHABLE_CODES.has(code);
}

export interface ConnectWithRetryOptions {
  readonly attempts?: number;
  readonly baseDelayMs?: number;
  readonly maxDelayMs?: number;
  readonly onRetry?: (attempt: number, delayMs: number, error: unknown) => void;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly random?: () => number;
}

/**
 * Opens the datastore connection, tolerating a cold start.
 *
 * A serverless Postgres (Neon, and every other autosuspending provider) parks
 * an idle database and takes a few seconds to wake it. Starting the platform
 * wakes fifteen of them at once, so the first connection of the day routinely
 * fails with P1001 — and a bare `$connect()` in `onModuleInit` turns that into
 * a service that exits and never comes back, while the rest of the stack comes
 * up fine. That is indistinguishable from a broken build to whoever ran
 * `pnpm dev`.
 *
 * Only reachability errors are retried. Bad credentials or a missing database
 * are not going to fix themselves, and retrying them just delays the report of
 * a real misconfiguration.
 */
export async function connectWithRetry(
  connect: () => Promise<void>,
  options: ConnectWithRetryOptions = {},
): Promise<void> {
  const { onRetry, ...rest } = options;

  // Sized for a cold serverless database rather than a blip: with full jitter
  // these bounds spend roughly half a minute trying, and up to a minute in the
  // worst case. Waking fifteen parked databases at once is slower than waking
  // one, and a shorter window simply moves the crash later in the boot.
  await withRetry(() => connect(), {
    attempts: rest.attempts ?? 10,
    baseDelayMs: rest.baseDelayMs ?? 1_000,
    maxDelayMs: rest.maxDelayMs ?? 10_000,
    ...(rest.sleep ? { sleep: rest.sleep } : {}),
    ...(rest.random ? { random: rest.random } : {}),
    isRetriable: isReachabilityError,
    ...(onRetry
      ? { onRetry: (error, attempt, delayMs) => onRetry(attempt, delayMs, error) }
      : {}),
  });
}
