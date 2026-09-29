import { DomainError, ErrorCode, type Permission, type Role } from '@staysphere/contracts';

export interface RouteDefinition {
  /** Path prefix under the API root, e.g. `/bookings`. */
  readonly prefix: string;
  /** Logical upstream name; resolved to a URL from configuration. */
  readonly upstream: string;
  /** When false, the gateway requires a valid access token. */
  readonly public: boolean;
  /** Optional coarse gate applied at the edge; services re-check authoritatively. */
  readonly roles?: readonly Role[];
  readonly permissions?: readonly Permission[];
  /** Per-route override of the global rate limit, in requests per minute. */
  readonly rateLimitPerMinute?: number;
}

/**
 * Ordered routing table. Matching is longest-prefix-first, so a specific route
 * such as `/auth/login` can be declared public while `/auth` as a whole stays
 * protected — declaration order does not silently decide security.
 */
export const ROUTE_TABLE: readonly RouteDefinition[] = [
  { prefix: '/auth/register', upstream: 'auth', public: true, rateLimitPerMinute: 10 },
  // Higher than registration on purpose: the primary brute-force control is the
  // per-account lockout in the auth service, and a whole reception desk signs in
  // from one office IP at shift change. Ten a minute would lock out the hotel.
  { prefix: '/auth/login', upstream: 'auth', public: true, rateLimitPerMinute: 30 },
  { prefix: '/auth/refresh', upstream: 'auth', public: true, rateLimitPerMinute: 30 },
  { prefix: '/auth/password-reset', upstream: 'auth', public: true, rateLimitPerMinute: 5 },
  { prefix: '/auth', upstream: 'auth', public: false },
  { prefix: '/users', upstream: 'auth', public: false },

  { prefix: '/bookings/availability', upstream: 'booking', public: true, rateLimitPerMinute: 120 },
  { prefix: '/bookings', upstream: 'booking', public: false },

  { prefix: '/hotels', upstream: 'hotel', public: true },
  { prefix: '/hotels/manage', upstream: 'hotel', public: false },

  { prefix: '/rooms', upstream: 'room', public: true },
  { prefix: '/rooms/board', upstream: 'room', public: false },

  { prefix: '/rates/quote', upstream: 'pricing', public: true, rateLimitPerMinute: 120 },
  { prefix: '/rates', upstream: 'pricing', public: false },

  { prefix: '/payments', upstream: 'payment', public: false },
  { prefix: '/stays', upstream: 'stay', public: false },
  { prefix: '/invoices', upstream: 'finance', public: false },
  { prefix: '/housekeeping', upstream: 'housekeeping', public: false },
  { prefix: '/maintenance', upstream: 'maintenance', public: false },
  { prefix: '/notifications', upstream: 'notification', public: false },

  { prefix: '/reviews', upstream: 'review', public: true },
  { prefix: '/reviews/moderation-queue', upstream: 'review', public: false },

  { prefix: '/reports', upstream: 'reporting', public: false },
  { prefix: '/audit', upstream: 'audit', public: false },
];

/**
 * Resolves the route for a path.
 *
 * Longest match wins regardless of table order. An unmatched path returns
 * `null` so the caller can answer 404 rather than proxying blindly.
 */
export function matchRoute(
  path: string,
  table: readonly RouteDefinition[] = ROUTE_TABLE,
): RouteDefinition | null {
  const normalised = normalisePath(path);
  let best: RouteDefinition | null = null;

  for (const route of table) {
    if (!isPrefixOf(route.prefix, normalised)) continue;
    if (!best || route.prefix.length > best.prefix.length) best = route;
  }
  return best;
}

/**
 * Prefix match on *segment* boundaries. A plain `startsWith` would route
 * `/bookings-admin` to the bookings service and, worse, `/auth/loginz` to the
 * public `/auth/login` rule — bypassing authentication.
 */
function isPrefixOf(prefix: string, path: string): boolean {
  if (path === prefix) return true;
  return path.startsWith(`${prefix}/`);
}

export function normalisePath(path: string): string {
  const withoutQuery = path.split('?')[0] ?? path;
  const collapsed = withoutQuery.replace(/\/{2,}/g, '/');
  return collapsed.length > 1 && collapsed.endsWith('/') ? collapsed.slice(0, -1) : collapsed;
}

/** Strips the versioned API root, returning the path used for route matching. */
export function stripApiPrefix(path: string, apiPrefix = '/api/v1'): string {
  const normalised = normalisePath(path);
  return normalised.startsWith(apiPrefix) ? normalised.slice(apiPrefix.length) || '/' : normalised;
}

/**
 * Paths the gateway serves itself rather than proxying.
 *
 * These are deliberately excluded from the route table: they belong to the
 * gateway process, not to any upstream. Routing them through the table means
 * the edge auth guard rejects them as unknown routes, and every Kubernetes
 * liveness and readiness probe fails — which takes the whole deployment down
 * while every individual service is perfectly healthy.
 */
export const GATEWAY_OWNED_PATHS: readonly string[] = ['/health', '/ready', '/metrics', '/docs'];

export function isGatewayOwnedPath(path: string): boolean {
  const normalised = normalisePath(path);
  return GATEWAY_OWNED_PATHS.some(
    (owned) => normalised === owned || normalised.startsWith(`${owned}/`),
  );
}

/**
 * The path prefix upstream services actually serve on.
 *
 * The public surface is `/api/v1/...`, but `/api` is an edge routing artifact:
 * services call `enableVersioning({ prefix: 'v', defaultVersion: '1' })` and
 * nothing more, so internally they answer on `/v1/...`. Forwarding the public
 * prefix verbatim makes every proxied request 404.
 */
export const UPSTREAM_API_PREFIX = '/v1';

/** Builds the upstream URL for a request that has already been route-matched. */
export function buildUpstreamUrl(baseUrl: string, path: string, query: string): string {
  const suffix = path === '/' ? '' : path;
  return `${baseUrl}${UPSTREAM_API_PREFIX}${suffix}${query ? `?${query}` : ''}`;
}

export function resolveUpstreamUrl(
  route: RouteDefinition,
  registry: Readonly<Record<string, string | undefined>>,
): string {
  const url = registry[route.upstream];
  if (!url) {
    throw new DomainError(
      ErrorCode.UPSTREAM_UNAVAILABLE,
      `The '${route.upstream}' service is not deployed in this environment.`,
      { details: { upstream: route.upstream } },
    );
  }
  return url;
}
