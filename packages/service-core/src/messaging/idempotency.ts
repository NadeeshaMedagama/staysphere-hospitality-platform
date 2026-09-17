import type { EventEnvelope } from '@staysphere/contracts';

export interface IdempotencyStore {
  /**
   * Atomically records `key` if absent.
   * @returns true when this caller claimed the key (first sighting).
   */
  claim(key: string, ttlSeconds: number): Promise<boolean>;
  release(key: string): Promise<void>;
}

/** In-memory store — suitable for tests and single-process development only. */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly seen = new Map<string, number>();

  constructor(private readonly now: () => number = Date.now) {}

  async claim(key: string, ttlSeconds: number): Promise<boolean> {
    const expiry = this.seen.get(key);
    const currentTime = this.now();
    if (expiry !== undefined && expiry > currentTime) return false;
    this.seen.set(key, currentTime + ttlSeconds * 1000);
    return true;
  }

  async release(key: string): Promise<void> {
    this.seen.delete(key);
  }
}

export interface ConsumeOptions {
  readonly consumerGroup: string;
  readonly ttlSeconds?: number;
}

export const DEFAULT_IDEMPOTENCY_TTL_SECONDS = 60 * 60 * 24 * 7;

/**
 * Runs `handler` at most once per (consumer group, event) pair.
 *
 * Brokers deliver at least once: a rebalance, a redeployment or a slow commit
 * all replay messages. Without this guard a replayed `payment.completed` would
 * refund or charge a guest twice.
 *
 * The claim is released when the handler throws, so a transient failure can be
 * retried rather than being silently swallowed as a duplicate.
 */
export async function consumeOnce<TPayload>(
  store: IdempotencyStore,
  envelope: EventEnvelope<TPayload>,
  options: ConsumeOptions,
  handler: (envelope: EventEnvelope<TPayload>) => Promise<void>,
): Promise<'processed' | 'duplicate'> {
  const key = idempotencyKey(options.consumerGroup, envelope.eventId);
  const claimed = await store.claim(key, options.ttlSeconds ?? DEFAULT_IDEMPOTENCY_TTL_SECONDS);
  if (!claimed) return 'duplicate';

  try {
    await handler(envelope);
    return 'processed';
  } catch (error) {
    await store.release(key);
    throw error;
  }
}

export function idempotencyKey(consumerGroup: string, eventId: string): string {
  return `idem:${consumerGroup}:${eventId}`;
}
