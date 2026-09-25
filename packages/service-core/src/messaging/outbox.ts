import type { EventEnvelope } from '@staysphere/contracts';

export interface OutboxRecord {
  readonly id: string;
  readonly topic: string;
  readonly partitionKey: string;
  readonly envelope: EventEnvelope;
  readonly createdAt: Date;
  readonly publishedAt: Date | null;
  readonly attempts: number;
  readonly lastError: string | null;
}

export interface OutboxStore {
  /** Claims a batch of unpublished records; implementations must lock rows. */
  claimBatch(limit: number): Promise<OutboxRecord[]>;
  markPublished(ids: readonly string[]): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
}

export interface MessagePublisher {
  publish(topic: string, key: string, envelope: EventEnvelope): Promise<void>;
}

export interface OutboxRelayOptions {
  readonly batchSize: number;
  /** Records that exceed this attempt count are parked for manual inspection. */
  readonly maxAttempts: number;
  readonly onPoison?: (record: OutboxRecord) => void;
}

export const DEFAULT_RELAY_OPTIONS: OutboxRelayOptions = {
  batchSize: 100,
  maxAttempts: 10,
};

/**
 * Transactional-outbox relay.
 *
 * A service writes its state change and the event it implies inside one database
 * transaction; this relay is what later moves those rows onto the broker. That
 * split is what makes "booking saved but event lost" (or the reverse)
 * impossible without a distributed transaction.
 *
 * Delivery is at-least-once, so consumers must de-duplicate on `eventId`.
 */
export class OutboxRelay {
  private readonly options: OutboxRelayOptions;

  constructor(
    private readonly store: OutboxStore,
    private readonly publisher: MessagePublisher,
    options: Partial<OutboxRelayOptions> = {},
  ) {
    this.options = { ...DEFAULT_RELAY_OPTIONS, ...options };
  }

  /** Drains one batch. Returns counts so a scheduler can back off when idle. */
  async drainOnce(): Promise<{ published: number; failed: number; poisoned: number }> {
    const batch = await this.store.claimBatch(this.options.batchSize);
    const publishedIds: string[] = [];
    let failed = 0;
    let poisoned = 0;

    for (const record of batch) {
      if (record.attempts >= this.options.maxAttempts) {
        poisoned += 1;
        this.options.onPoison?.(record);
        continue;
      }
      try {
        await this.publisher.publish(record.topic, record.partitionKey, record.envelope);
        publishedIds.push(record.id);
      } catch (error) {
        failed += 1;
        await this.store.markFailed(
          record.id,
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    if (publishedIds.length > 0) await this.store.markPublished(publishedIds);
    return { published: publishedIds.length, failed, poisoned };
  }
}
