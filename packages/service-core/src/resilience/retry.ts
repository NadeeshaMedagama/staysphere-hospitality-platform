export interface RetryOptions {
  readonly attempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  /** Deterministic in tests; defaults to Math.random. */
  readonly random?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly isRetriable?: (error: unknown) => boolean;
  readonly onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

export const DEFAULT_RETRY: RetryOptions = {
  attempts: 3,
  baseDelayMs: 100,
  maxDelayMs: 5_000,
};

/**
 * Full-jitter exponential backoff (AWS Architecture Blog). Plain exponential
 * backoff makes every client retry in lockstep and re-stampedes a recovering
 * service; jitter spreads the load out.
 */
export function backoffDelay(attempt: number, options: RetryOptions): number {
  const random = options.random ?? Math.random;
  const exponential = Math.min(options.maxDelayMs, options.baseDelayMs * 2 ** (attempt - 1));
  return Math.floor(random() * exponential);
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Retries `operation` with jittered backoff, rethrowing the final error. */
export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: Partial<RetryOptions> = {},
): Promise<T> {
  const resolved: RetryOptions = { ...DEFAULT_RETRY, ...options };
  const sleep = resolved.sleep ?? defaultSleep;
  const isRetriable = resolved.isRetriable ?? (() => true);

  let lastError: unknown;
  for (let attempt = 1; attempt <= resolved.attempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt === resolved.attempts || !isRetriable(error)) break;
      const delay = backoffDelay(attempt, resolved);
      resolved.onRetry?.(error, attempt, delay);
      await sleep(delay);
    }
  }
  throw lastError;
}
