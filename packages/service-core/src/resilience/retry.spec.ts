import { backoffDelay, withRetry } from './retry';

describe('withRetry', () => {
  const noSleep = () => Promise.resolve();

  it('returns the first successful result without retrying', async () => {
    const operation = jest.fn().mockResolvedValue('ok');
    await expect(withRetry(operation, { sleep: noSleep })).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('retries until the operation succeeds', async () => {
    const operation = jest
      .fn()
      .mockRejectedValueOnce(new Error('flaky'))
      .mockRejectedValueOnce(new Error('flaky'))
      .mockResolvedValue('ok');

    await expect(withRetry(operation, { sleep: noSleep, random: () => 0 })).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('rethrows the final error after exhausting attempts', async () => {
    const operation = jest.fn().mockRejectedValue(new Error('permanently down'));
    await expect(
      withRetry(operation, { attempts: 3, sleep: noSleep, random: () => 0 }),
    ).rejects.toThrow('permanently down');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('does not retry an error classified as non-retriable', async () => {
    const operation = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error('bad input'), { status: 400 }));
    await expect(
      withRetry(operation, {
        sleep: noSleep,
        isRetriable: (error) => (error as { status?: number }).status !== 400,
      }),
    ).rejects.toThrow('bad input');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('reports each retry with its delay', async () => {
    const onRetry = jest.fn();
    const operation = jest.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue('ok');
    await withRetry(operation, { sleep: noSleep, random: () => 1, onRetry, baseDelayMs: 100 });
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1, 100);
  });
});

describe('backoffDelay', () => {
  const options = { attempts: 5, baseDelayMs: 100, maxDelayMs: 5_000 };

  it('grows exponentially at the jitter ceiling', () => {
    const full = { ...options, random: () => 1 };
    expect(backoffDelay(1, full)).toBe(100);
    expect(backoffDelay(2, full)).toBe(200);
    expect(backoffDelay(3, full)).toBe(400);
  });

  it('never exceeds the configured maximum', () => {
    expect(backoffDelay(20, { ...options, random: () => 1 })).toBe(5_000);
  });

  it('applies full jitter so clients do not retry in lockstep', () => {
    expect(backoffDelay(4, { ...options, random: () => 0 })).toBe(0);
    expect(backoffDelay(4, { ...options, random: () => 0.5 })).toBe(400);
  });
});
