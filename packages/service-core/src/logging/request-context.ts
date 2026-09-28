import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  /** Unique per inbound request; echoed back in the response envelope. */
  readonly requestId: string;
  /** Stable across the whole distributed interaction; propagated downstream. */
  readonly correlationId: string;
  readonly userId?: string;
  readonly hotelId?: string;
  readonly roles?: readonly string[];
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Runs `fn` with `context` bound to the current async execution path. */
export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function currentContext(): RequestContext | undefined {
  return storage.getStore();
}

/**
 * Correlation id for the in-flight request, falling back to a placeholder when
 * called outside a request (e.g. from a cron or a Kafka consumer bootstrap).
 */
export function currentCorrelationId(fallback = 'no-correlation'): string {
  return storage.getStore()?.correlationId ?? fallback;
}

export const REQUEST_ID_HEADER = 'x-request-id';
export const CORRELATION_ID_HEADER = 'x-correlation-id';
