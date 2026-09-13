import { DomainError, ErrorCode } from '@staysphere/contracts';
import { CircuitBreaker } from './circuit-breaker';

describe('CircuitBreaker', () => {
  let clock: number;
  const now = () => clock;
  const fail = () => Promise.reject(new Error('upstream down'));
  const succeed = () => Promise.resolve('ok');

  beforeEach(() => {
    clock = 1_000;
  });

  const build = () =>
    new CircuitBreaker({
      name: 'room-service',
      failureThreshold: 3,
      successThreshold: 2,
      resetTimeoutMs: 30_000,
      now,
    });

  it('stays closed while the dependency is healthy', async () => {
    const breaker = build();
    await expect(breaker.execute(succeed)).resolves.toBe('ok');
    expect(breaker.currentState).toBe('CLOSED');
  });

  it('trips open once consecutive failures reach the threshold', async () => {
    const breaker = build();
    for (let i = 0; i < 3; i += 1) {
      await expect(breaker.execute(fail)).rejects.toThrow('upstream down');
    }
    expect(breaker.currentState).toBe('OPEN');
  });

  it('resets the failure count after a success, so isolated blips do not trip it', async () => {
    const breaker = build();
    await expect(breaker.execute(fail)).rejects.toThrow();
    await expect(breaker.execute(fail)).rejects.toThrow();
    await breaker.execute(succeed);
    await expect(breaker.execute(fail)).rejects.toThrow();
    expect(breaker.currentState).toBe('CLOSED');
  });

  it('sheds load with CIRCUIT_OPEN while open, without calling the dependency', async () => {
    const breaker = build();
    for (let i = 0; i < 3; i += 1) await breaker.execute(fail).catch(() => undefined);

    const dependency = jest.fn(succeed);
    await expect(breaker.execute(dependency)).rejects.toMatchObject({
      code: ErrorCode.CIRCUIT_OPEN,
    });
    expect(dependency).not.toHaveBeenCalled();
  });

  it('probes again after the reset timeout elapses', async () => {
    const breaker = build();
    for (let i = 0; i < 3; i += 1) await breaker.execute(fail).catch(() => undefined);

    clock += 30_001;
    await breaker.execute(succeed);
    expect(breaker.currentState).toBe('HALF_OPEN');
  });

  it('closes only after enough consecutive successful probes', async () => {
    const breaker = build();
    for (let i = 0; i < 3; i += 1) await breaker.execute(fail).catch(() => undefined);
    clock += 30_001;

    await breaker.execute(succeed);
    expect(breaker.currentState).toBe('HALF_OPEN');
    await breaker.execute(succeed);
    expect(breaker.currentState).toBe('CLOSED');
  });

  it('re-opens immediately when a half-open probe fails', async () => {
    const breaker = build();
    for (let i = 0; i < 3; i += 1) await breaker.execute(fail).catch(() => undefined);
    clock += 30_001;

    await expect(breaker.execute(fail)).rejects.toThrow('upstream down');
    expect(breaker.currentState).toBe('OPEN');
    await expect(breaker.execute(succeed)).rejects.toBeInstanceOf(DomainError);
  });
});
