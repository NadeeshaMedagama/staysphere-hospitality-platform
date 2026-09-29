import { DomainError, ErrorCode } from '@staysphere/contracts';
import { RouteRateLimitGuard } from './route-rate-limit.guard.js';
import { matchRoute } from './route-table.js';

function contextFor(url: string, ip = '10.0.0.1') {
  return {
    switchToHttp: () => ({ getRequest: () => ({ method: 'POST', url, ip, headers: {} }) }),
  } as never;
}

describe('RouteRateLimitGuard', () => {
  it('allows a route the table sets no limit for', () => {
    const guard = new RouteRateLimitGuard();
    for (let i = 0; i < 200; i += 1) {
      expect(guard.canActivate(contextFor('/api/v1/stays'))).toBe(true);
    }
  });

  it('enforces the declared login limit', () => {
    const guard = new RouteRateLimitGuard();
    const limit = matchRoute('/auth/login')?.rateLimitPerMinute as number;

    for (let i = 0; i < limit; i += 1) {
      expect(guard.canActivate(contextFor('/api/v1/auth/login'))).toBe(true);
    }

    expect(() => guard.canActivate(contextFor('/api/v1/auth/login'))).toThrow(DomainError);
    try {
      guard.canActivate(contextFor('/api/v1/auth/login'));
    } catch (error) {
      expect((error as DomainError).code).toBe(ErrorCode.RATE_LIMITED);
      expect((error as DomainError).details).toMatchObject({ limit, windowSeconds: 60 });
    }
  });

  it('counts each client separately', () => {
    const guard = new RouteRateLimitGuard();
    const limit = matchRoute('/auth/login')?.rateLimitPerMinute as number;
    for (let i = 0; i < limit; i += 1) {
      guard.canActivate(contextFor('/api/v1/auth/login', '10.0.0.1'));
    }

    expect(guard.canActivate(contextFor('/api/v1/auth/login', '10.0.0.2'))).toBe(true);
  });

  it('counts each route separately', () => {
    const guard = new RouteRateLimitGuard();
    for (let i = 0; i < 5; i += 1) guard.canActivate(contextFor('/api/v1/auth/password-reset'));

    expect(() => guard.canActivate(contextFor('/api/v1/auth/password-reset'))).toThrow(DomainError);
    expect(guard.canActivate(contextFor('/api/v1/auth/login'))).toBe(true);
  });

  it('never rate-limits the gateway’s own probes', () => {
    const guard = new RouteRateLimitGuard();
    for (let i = 0; i < 500; i += 1) {
      expect(guard.canActivate(contextFor('/health'))).toBe(true);
    }
  });
});
