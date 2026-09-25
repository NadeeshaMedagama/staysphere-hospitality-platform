import type { EventEnvelope } from '@staysphere/contracts';
import { OutboxRelay, type OutboxRecord, type OutboxStore } from './outbox';

const envelope: EventEnvelope = {
  eventId: 'evt_1',
  type: 'booking.confirmed',
  version: 1,
  source: 'booking-service',
  occurredAt: '2026-09-08T09:15:00.000Z',
  correlationId: 'req_1',
  payload: {},
};

function record(id: string, attempts = 0): OutboxRecord {
  return {
    id,
    topic: 'staysphere.booking.v1',
    partitionKey: 'htl_001',
    envelope: { ...envelope, eventId: `evt_${id}` },
    createdAt: new Date('2026-09-08T09:00:00.000Z'),
    publishedAt: null,
    attempts,
    lastError: null,
  };
}

function buildStore(batch: OutboxRecord[]): jest.Mocked<OutboxStore> {
  return {
    claimBatch: jest.fn().mockResolvedValue(batch),
    markPublished: jest.fn().mockResolvedValue(undefined),
    markFailed: jest.fn().mockResolvedValue(undefined),
  };
}

describe('OutboxRelay', () => {
  it('publishes a claimed batch and marks it published in one call', async () => {
    const store = buildStore([record('a'), record('b')]);
    const publisher = { publish: jest.fn().mockResolvedValue(undefined) };

    await expect(new OutboxRelay(store, publisher).drainOnce()).resolves.toEqual({
      published: 2,
      failed: 0,
      poisoned: 0,
    });
    expect(publisher.publish).toHaveBeenCalledTimes(2);
    expect(store.markPublished).toHaveBeenCalledWith(['a', 'b']);
  });

  it('keeps publishing the rest of the batch when one record fails', async () => {
    const store = buildStore([record('a'), record('b'), record('c')]);
    const publisher = {
      publish: jest
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('broker unreachable'))
        .mockResolvedValueOnce(undefined),
    };

    await expect(new OutboxRelay(store, publisher).drainOnce()).resolves.toEqual({
      published: 2,
      failed: 1,
      poisoned: 0,
    });
    expect(store.markFailed).toHaveBeenCalledWith('b', 'broker unreachable');
    expect(store.markPublished).toHaveBeenCalledWith(['a', 'c']);
  });

  it('parks poison records instead of retrying them forever', async () => {
    const onPoison = jest.fn();
    const store = buildStore([record('a', 10), record('b')]);
    const publisher = { publish: jest.fn().mockResolvedValue(undefined) };

    const result = await new OutboxRelay(store, publisher, {
      maxAttempts: 10,
      onPoison,
    }).drainOnce();

    expect(result).toEqual({ published: 1, failed: 0, poisoned: 1 });
    expect(onPoison).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
    expect(publisher.publish).toHaveBeenCalledTimes(1);
  });

  it('does not write to the store when the batch is empty', async () => {
    const store = buildStore([]);
    const publisher = { publish: jest.fn() };
    await expect(new OutboxRelay(store, publisher).drainOnce()).resolves.toEqual({
      published: 0,
      failed: 0,
      poisoned: 0,
    });
    expect(store.markPublished).not.toHaveBeenCalled();
  });
});
