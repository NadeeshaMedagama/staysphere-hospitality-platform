import { connectWithRetry } from './datastore-connect.js';

/** Prisma throws this shape; only `errorCode` distinguishes the cause. */
function prismaError(errorCode: string): Error & { errorCode: string } {
  return Object.assign(new Error(`prisma failed: ${errorCode}`), { errorCode });
}

const noSleep = async (): Promise<void> => {};

describe('connectWithRetry', () => {
  it('returns as soon as the connection succeeds', async () => {
    const connect = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);

    await connectWithRetry(connect, { sleep: noSleep });

    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('rides out a cold start and connects on a later attempt', async () => {
    const connect = jest
      .fn<Promise<void>, []>()
      .mockRejectedValueOnce(prismaError('P1001'))
      .mockRejectedValueOnce(prismaError('P1001'))
      .mockResolvedValue(undefined);

    await connectWithRetry(connect, { sleep: noSleep });

    expect(connect).toHaveBeenCalledTimes(3);
  });

  it('gives up after the configured number of attempts', async () => {
    const connect = jest.fn<Promise<void>, []>().mockRejectedValue(prismaError('P1001'));

    await expect(connectWithRetry(connect, { attempts: 3, sleep: noSleep })).rejects.toThrow(
      /P1001/,
    );
    expect(connect).toHaveBeenCalledTimes(3);
  });

  it('fails immediately on an error retrying cannot fix', async () => {
    // Bad credentials are not going to become good. Retrying them only delays
    // the report of a real misconfiguration.
    const connect = jest.fn<Promise<void>, []>().mockRejectedValue(prismaError('P1000'));

    await expect(connectWithRetry(connect, { sleep: noSleep })).rejects.toThrow(/P1000/);
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('reports each retry so a slow start is visible in the logs', async () => {
    const onRetry = jest.fn();
    const connect = jest
      .fn<Promise<void>, []>()
      .mockRejectedValueOnce(prismaError('P1001'))
      .mockResolvedValue(undefined);

    await connectWithRetry(connect, { sleep: noSleep, onRetry });

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Number), expect.any(Error));
  });
});
