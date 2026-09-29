import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { DomainError, ErrorCode } from '@staysphere/contracts';
import { isGatewayOwnedPath, matchRoute, stripApiPrefix } from './route-table.js';

interface RateLimitedRequest {
  method: string;
  originalUrl?: string;
  url: string;
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

const WINDOW_MS = 60_000;

/**
 * Enforces the per-route limits declared in the route table.
 *
 * The global throttler is a blunt instrument: 120 requests a minute is right for
 * browsing, and far too generous for `/auth/login`, where 120 password attempts a
 * minute is an offer rather than a limit. The route table already states the
 * intended figure for each sensitive path; this guard is what makes that
 * statement true, and it runs in addition to — not instead of — the global limit.
 *
 * Counters are per-process, the same trade-off the default throttler storage
 * already makes: with several replicas the effective limit is the declared figure
 * multiplied by the replica count. Shared enforcement needs Redis-backed storage,
 * which is a deployment concern rather than a routing one.
 */
@Injectable()
export class RouteRateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, number[]>();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RateLimitedRequest>();
    const [pathname = ''] = (request.originalUrl ?? request.url).split('?');
    const path = stripApiPrefix(pathname);

    if (isGatewayOwnedPath(path)) return true;

    const limit = matchRoute(path)?.rateLimitPerMinute;
    if (limit === undefined) return true;

    const now = Date.now();
    const key = `${clientIp(request)}|${path}`;
    const recent = (this.hits.get(key) ?? []).filter((at) => now - at < WINDOW_MS);

    if (recent.length >= limit) {
      const retryAfter = Math.ceil((WINDOW_MS - (now - (recent[0] as number))) / 1000);
      this.hits.set(key, recent);
      throw new DomainError(ErrorCode.RATE_LIMITED, 'Too many requests for this endpoint.', {
        details: { limit, windowSeconds: WINDOW_MS / 1000, retryAfterSeconds: retryAfter },
      });
    }

    recent.push(now);
    this.hits.set(key, recent);
    this.evictStale(now);
    return true;
  }

  /** Keeps the map from growing without bound on a long-lived process. */
  private evictStale(now: number): void {
    if (this.hits.size < 10_000) return;
    for (const [key, times] of this.hits) {
      if (times.every((at) => now - at >= WINDOW_MS)) this.hits.delete(key);
    }
  }
}

function clientIp(request: RateLimitedRequest): string {
  const forwarded = request.headers['x-forwarded-for'];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return first?.split(',')[0]?.trim() || request.ip || 'unknown';
}
