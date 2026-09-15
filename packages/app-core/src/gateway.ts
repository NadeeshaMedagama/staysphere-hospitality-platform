import { ErrorCode, type ApiResponse, type ResponseMeta } from '@staysphere/contracts';

/**
 * Base URL of the API gateway, including the versioned API root.
 *
 * Every front end talks to the gateway and never to a service directly, so this
 * is the only upstream an app knows about. The value is public (it appears in
 * server-rendered markup and in DevTools either way), but it is read on the
 * server only — no token ever reaches the client bundle.
 */
export const GATEWAY_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1'
).replace(/\/+$/, '');

/**
 * The outcome of a gateway call.
 *
 * Failure is a value rather than an exception because the caller almost always
 * has something useful to render for it — an unreachable service and a genuine
 * empty list are different screens, and collapsing them into one `catch` is how
 * a console ends up showing "no reservations" during an outage.
 */
export type GatewayResult<T> =
  | { readonly ok: true; readonly data: T; readonly meta?: ResponseMeta }
  | {
      readonly ok: false;
      readonly status: number;
      readonly code: ErrorCode;
      readonly message: string;
      readonly details?: Readonly<Record<string, unknown>>;
    };

export interface GatewayRequest {
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  readonly body?: unknown;
  readonly accessToken?: string;
  /** Forwarded so a failed call can be traced across services. */
  readonly headers?: Readonly<Record<string, string>>;
  /** Seconds to cache a GET for. Omitted means no caching. */
  readonly revalidate?: number;
  readonly signal?: AbortSignal;
}

/**
 * Milliseconds before a gateway call is abandoned.
 *
 * Twelve seconds suits a deployment sitting next to its database. A developer
 * machine talking to a hosted database in another region is far slower — a
 * screen that issues three queries in parallel can exceed this on latency
 * alone — and the resulting timeout reads as "the service is not responding"
 * when the service is merely far away. Raise it there rather than lowering the
 * bar for production.
 */
const TIMEOUT_MS = Number(process.env.NEXT_PUBLIC_GATEWAY_TIMEOUT_MS ?? 12_000);

/**
 * Calls the gateway and unwraps the standard response envelope.
 *
 * `path` is relative to the versioned API root, e.g. `/auth/login`.
 */
export async function gatewayFetch<T>(
  path: string,
  request: GatewayRequest = {},
): Promise<GatewayResult<T>> {
  const { method = 'GET', body, accessToken, headers, revalidate, signal } = request;

  // A hung upstream must not hold a server render open until the platform's own
  // timeout fires; the page renders a degraded state instead.
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const abort = signal ? AbortSignal.any([signal, timeout]) : timeout;

  let response: Response;
  try {
    response = await fetch(`${GATEWAY_URL}${path}`, {
      method,
      headers: {
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: abort,
      // Authenticated reads must never be served from a shared cache: the
      // response is scoped to one principal.
      cache: revalidate === undefined || accessToken ? 'no-store' : undefined,
      ...(revalidate !== undefined && !accessToken ? { next: { revalidate } } : {}),
    });
  } catch (cause) {
    const timedOut = cause instanceof Error && cause.name === 'TimeoutError';
    return {
      ok: false,
      status: timedOut ? 504 : 503,
      code: timedOut ? ErrorCode.UPSTREAM_TIMEOUT : ErrorCode.UPSTREAM_UNAVAILABLE,
      message: timedOut
        ? 'The service did not respond in time.'
        : 'The service is not reachable from this environment.',
    };
  }

  if (response.status === 204) {
    return { ok: true, data: undefined as T };
  }

  let payload: ApiResponse<T> | null = null;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    payload = null;
  }

  // A body that is missing or not an envelope means the response came from
  // something other than a StaySphere service — a proxy error page, typically.
  if (!payload || typeof payload !== 'object' || !('success' in payload)) {
    return {
      ok: false,
      status: response.status,
      code: response.ok ? ErrorCode.INTERNAL_ERROR : ErrorCode.UPSTREAM_UNAVAILABLE,
      message: 'The service returned an unreadable response.',
    };
  }

  if (payload.success) {
    return { ok: true, data: payload.data, ...(payload.meta ? { meta: payload.meta } : {}) };
  }

  return {
    ok: false,
    status: response.status,
    code: payload.error.code,
    message: payload.error.message,
    ...(payload.error.details ? { details: payload.error.details } : {}),
  };
}
