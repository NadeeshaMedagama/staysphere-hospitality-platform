import type { EventEnvelope } from '@staysphere/contracts';
import { InMemoryIdempotencyStore, consumeOnce, idempotencyKey } from './idempotency';

const envelope: EventEnvelope<{ paymentId: string }> = {
  eventId: 'evt_01HZXQ8F4M9K',
  type: 'payment.completed',
  version: 1,
  source: 'payment-service',
  occurredAt: '2026-09-08T09:15:00.000Z',
  correlationId: 'req_9f2b71ac',
  payload: { paymentId: 'pay_9' },
};

describe('consumeOnce', () => {
  let clock: number;
  let store: InMemoryIdempotencyStore;

  beforeEach(() => {
    clock = 1_000_000;
    store = new InMemoryIdempotencyStore(() => clock);
  });

  it('runs the handler on first delivery', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    await expect(consumeOnce(store, envelope, { consumerGroup: 'finance' }, handler)).resolves.toBe(
      'processed',
    );
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('suppresses a redelivery of the same event', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    await consumeOnce(store, envelope, { consumerGroup: 'finance' }, handler);
    await expect(consumeOnce(store, envelope, { consumerGroup: 'finance' }, handler)).resolves.toBe(
      'duplicate',
    );
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('lets a different consumer group process the same event independently', async () => {
    const finance = jest.fn().mockResolvedValue(undefined);
    const notifications = jest.fn().mockResolvedValue(undefined);
    await consumeOnce(store, envelope, { consumerGroup: 'finance' }, finance);
    await expect(
      consumeOnce(store, envelope, { consumerGroup: 'notifications' }, notifications),
    ).resolves.toBe('processed');
    expect(notifications).toHaveBeenCalledTimes(1);
  });

  it('releases the claim when the handler throws, so the retry is not swallowed', async () => {
    const handler = jest
      .fn()
      .mockRejectedValueOnce(new Error('db unavailable'))
      .mockResolvedValue(undefined);

    await expect(
      consumeOnce(store, envelope, { consumerGroup: 'finance' }, handler),
    ).rejects.toThrow('db unavailable');

    await expect(consumeOnce(store, envelope, { consumerGroup: 'finance' }, handler)).resolves.toBe(
      'processed',
    );
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('re-processes once the de-duplication window has expired', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    await consumeOnce(store, envelope, { consumerGroup: 'finance', ttlSeconds: 60 }, handler);
    clock += 61_000;
    await expect(
      consumeOnce(store, envelope, { consumerGroup: 'finance', ttlSeconds: 60 }, handler),
    ).resolves.toBe('processed');
  });

  it('namespaces keys by consumer group', () => {
    expect(idempotencyKey('finance', 'evt_1')).toBe('idem:finance:evt_1');
  });
});
