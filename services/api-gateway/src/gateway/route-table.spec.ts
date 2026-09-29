import { ErrorCode } from '@staysphere/contracts';
import {
  GATEWAY_OWNED_PATHS,
  ROUTE_TABLE,
  UPSTREAM_API_PREFIX,
  buildUpstreamUrl,
  isGatewayOwnedPath,
  matchRoute,
  normalisePath,
  resolveUpstreamUrl,
  stripApiPrefix,
} from './route-table';

describe('matchRoute', () => {
  it('routes a known prefix to its upstream', () => {
    expect(matchRoute('/bookings')).toMatchObject({ upstream: 'booking', public: false });
  });

  it('prefers the longest matching prefix regardless of table order', () => {
    expect(matchRoute('/bookings/availability')).toMatchObject({
      prefix: '/bookings/availability',
      public: true,
    });
    expect(matchRoute('/auth/login')).toMatchObject({ prefix: '/auth/login', public: true });
  });

  it('keeps the rest of a namespace protected when one child is public', () => {
    expect(matchRoute('/auth/me')).toMatchObject({ prefix: '/auth', public: false });
    expect(matchRoute('/bookings/bkg_1')).toMatchObject({ prefix: '/bookings', public: false });
  });

  it('matches only on segment boundaries, so a public rule cannot be widened', () => {
    // '/auth/loginz' must NOT inherit the public '/auth/login' rule.
    expect(matchRoute('/auth/loginz')).toMatchObject({ prefix: '/auth', public: false });
    expect(matchRoute('/bookings-admin')).toBeNull();
  });

  it('returns null for an unknown path so the gateway can answer 404', () => {
    expect(matchRoute('/unknown')).toBeNull();
    expect(matchRoute('/')).toBeNull();
  });

  it('ignores the query string and trailing slashes', () => {
    expect(matchRoute('/bookings/?page=2')).toMatchObject({ upstream: 'booking' });
    expect(matchRoute('/bookings/availability/?checkIn=2026-10-01')).toMatchObject({
      prefix: '/bookings/availability',
    });
  });

  it('routes every implemented service', () => {
    const expected: Array<[string, string]> = [
      ['/auth/me', 'auth'],
      ['/bookings', 'booking'],
      ['/hotels', 'hotel'],
      ['/rooms', 'room'],
      ['/rates', 'pricing'],
      ['/payments', 'payment'],
      ['/stays', 'stay'],
      ['/invoices', 'finance'],
      ['/housekeeping', 'housekeeping'],
      ['/maintenance', 'maintenance'],
      ['/notifications', 'notification'],
      ['/reviews', 'review'],
      ['/reports', 'reporting'],
      ['/audit', 'audit'],
    ];
    for (const [path, upstream] of expected) {
      expect({ path, upstream: matchRoute(path)?.upstream }).toEqual({ path, upstream });
    }
  });

  it('exposes only the guest-facing read paths publicly', () => {
    // A guest prices a stay and reads reviews; nobody browses the audit log.
    for (const path of [
      '/hotels',
      '/rooms',
      '/rates/quote',
      '/reviews',
      '/bookings/availability',
    ]) {
      expect({ path, public: matchRoute(path)?.public }).toEqual({ path, public: true });
    }
    for (const path of ['/rates', '/payments', '/stays', '/invoices', '/audit', '/reports']) {
      expect({ path, public: matchRoute(path)?.public }).toEqual({ path, public: false });
    }
  });

  it('keeps the moderation queue private even though reviews are public', () => {
    expect(matchRoute('/reviews/moderation-queue')?.public).toBe(false);
    expect(matchRoute('/reviews/rating')?.public).toBe(true);
  });

  it('declares no duplicate prefixes', () => {
    const prefixes = ROUTE_TABLE.map((route) => route.prefix);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });

  it('rate-limits the credential endpoints more tightly than the default', () => {
    // Exact figures, not an upper bound: a limit that quietly drifts upwards is
    // the failure this test exists to catch.
    expect(matchRoute('/auth/login')?.rateLimitPerMinute).toBe(30);
    expect(matchRoute('/auth/register')?.rateLimitPerMinute).toBe(10);
    expect(matchRoute('/auth/password-reset')?.rateLimitPerMinute).toBe(5);
  });
});

describe('normalisePath', () => {
  it('collapses duplicate slashes and strips a trailing slash', () => {
    expect(normalisePath('//bookings//availability/')).toBe('/bookings/availability');
  });

  it('preserves the root path', () => {
    expect(normalisePath('/')).toBe('/');
  });
});

describe('stripApiPrefix', () => {
  it('removes the versioned API root', () => {
    expect(stripApiPrefix('/api/v1/bookings')).toBe('/bookings');
  });

  it('maps the bare root to /', () => {
    expect(stripApiPrefix('/api/v1')).toBe('/');
  });

  it('leaves an unprefixed path untouched', () => {
    expect(stripApiPrefix('/health')).toBe('/health');
  });
});

describe('resolveUpstreamUrl', () => {
  const registry = { booking: 'http://booking-service:3002' };

  it('resolves a configured upstream', () => {
    expect(resolveUpstreamUrl(matchRoute('/bookings')!, registry)).toBe(
      'http://booking-service:3002',
    );
  });

  it('fails with UPSTREAM_UNAVAILABLE when a service is not deployed', () => {
    expect(() => resolveUpstreamUrl(matchRoute('/reports')!, registry)).toThrow(
      expect.objectContaining({ code: ErrorCode.UPSTREAM_UNAVAILABLE }),
    );
  });
});

describe('gateway-owned paths', () => {
  it('claims the operational endpoints this process serves itself', () => {
    for (const path of ['/health', '/ready', '/metrics', '/docs']) {
      expect({ path, owned: isGatewayOwnedPath(path) }).toEqual({ path, owned: true });
    }
  });

  it('claims sub-paths of the docs UI', () => {
    expect(isGatewayOwnedPath('/docs/swagger-ui.css')).toBe(true);
  });

  it('does not claim a proxied route', () => {
    for (const path of ['/api/v1/bookings', '/bookings', '/healthcheck', '/metrics-export']) {
      expect({ path, owned: isGatewayOwnedPath(path) }).toEqual({ path, owned: false });
    }
  });

  it('keeps them out of the route table, so nothing tries to proxy them', () => {
    // The bug this prevents: the edge guard evaluating /health against the
    // table, finding nothing, and failing every Kubernetes probe.
    for (const path of GATEWAY_OWNED_PATHS) {
      expect({ path, route: matchRoute(path) }).toEqual({ path, route: null });
    }
  });
});

describe('buildUpstreamUrl', () => {
  const base = 'http://auth-service:3001';

  it('targets the prefix services actually serve, not the public one', () => {
    // Services only call enableVersioning; `/api` is an edge artifact. Sending
    // the public prefix upstream 404s every proxied request.
    expect(buildUpstreamUrl(base, '/auth/login', '')).toBe(
      'http://auth-service:3001/v1/auth/login',
    );
    expect(UPSTREAM_API_PREFIX).toBe('/v1');
  });

  it('carries the query string through', () => {
    expect(buildUpstreamUrl(base, '/bookings', 'page=2&pageSize=10')).toBe(
      'http://auth-service:3001/v1/bookings?page=2&pageSize=10',
    );
  });

  it('does not leave a trailing slash for the bare root', () => {
    expect(buildUpstreamUrl(base, '/', '')).toBe('http://auth-service:3001/v1');
  });
});
