import { DomainError, ErrorCode } from '@staysphere/contracts';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  readonly name: string;
  /** Consecutive failures before the circuit trips. */
  readonly failureThreshold: number;
  /** How long to stay OPEN before probing the dependency again. */
  readonly resetTimeoutMs: number;
  /** Consecutive successes in HALF_OPEN required to fully close. */
  readonly successThreshold: number;
  /** Injected clock, so tests need no timers. */
  readonly now?: () => number;
}

export const DEFAULT_CIRCUIT: Omit<CircuitBreakerOptions, 'name'> = {
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
  successThreshold: 2,
};

/**
 * Circuit breaker for calls that leave the process.
 *
 * Without one, a slow dependency turns into exhausted connection pools here,
 * which turns into timeouts for our own callers — one failing service takes the
 * platform down. Tripping fast converts that cascade into a clean 503.
 */
export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private successes = 0;
  private openedAt = 0;
  private readonly options: CircuitBreakerOptions;
  private readonly now: () => number;

  constructor(options: Partial<CircuitBreakerOptions> & Pick<CircuitBreakerOptions, 'name'>) {
    this.options = { ...DEFAULT_CIRCUIT, ...options };
    this.now = this.options.now ?? Date.now;
  }

  get currentState(): CircuitState {
    return this.state;
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (this.now() - this.openedAt < this.options.resetTimeoutMs) {
        throw new DomainError(
          ErrorCode.CIRCUIT_OPEN,
          `Dependency '${this.options.name}' is unavailable; requests are being shed.`,
          { details: { dependency: this.options.name, state: this.state } },
        );
      }
      this.state = 'HALF_OPEN';
      this.successes = 0;
    }

    try {
      const result = await operation();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  private recordSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.successes += 1;
      if (this.successes >= this.options.successThreshold) this.close();
      return;
    }
    this.failures = 0;
  }

  private recordFailure(): void {
    // A failed probe in HALF_OPEN re-opens immediately rather than waiting for
    // the threshold again — the dependency has already proven it is still sick.
    if (this.state === 'HALF_OPEN') {
      this.open();
      return;
    }
    this.failures += 1;
    if (this.failures >= this.options.failureThreshold) this.open();
  }

  private open(): void {
    this.state = 'OPEN';
    this.openedAt = this.now();
    this.successes = 0;
  }

  private close(): void {
    this.state = 'CLOSED';
    this.failures = 0;
    this.successes = 0;
  }
}
