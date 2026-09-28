import { NextResponse, type NextRequest } from 'next/server';
import { GATEWAY_URL } from './gateway';
import {
  needsRefresh,
  parseSession,
  serialiseSession,
  type AuthenticatedResult,
  type SessionCookieOptions,
} from './session';

/**
 * Builds the middleware that keeps a session alive.
 *
 * The access token lasts fifteen minutes and the refresh token thirty days, so
 * without this someone is signed out mid-shift while holding a perfectly valid
 * refresh token. Rotation has to happen in middleware rather than in a page: a
 * server component cannot write cookies, and middleware can.
 */
export function createRefreshMiddleware(
  cookieName: string,
  cookieOptions: () => SessionCookieOptions,
) {
  return async function refreshMiddleware(request: NextRequest): Promise<NextResponse> {
    const session = parseSession(request.cookies.get(cookieName)?.value);
    if (!session || !needsRefresh(session)) return NextResponse.next();

    let refreshed: AuthenticatedResult | null = null;
    try {
      const response = await fetch(`${GATEWAY_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
        signal: AbortSignal.timeout(5_000),
        cache: 'no-store',
      });

      if (response.status === 401 || response.status === 403) {
        // The refresh token is spent, revoked or replayed. Clearing the cookie
        // now turns the next page into a clean "sign in again" rather than a
        // sequence of failing calls behind a signed-in-looking header.
        const cleared = NextResponse.next();
        cleared.cookies.delete(cookieName);
        return cleared;
      }

      if (response.ok) {
        const payload = (await response.json()) as {
          success: boolean;
          data: AuthenticatedResult;
        };
        if (payload.success) refreshed = payload.data;
      }
    } catch {
      // The gateway is unreachable. The existing cookie is left alone: the
      // outage is almost certainly shorter than the refresh token's life, and
      // signing everyone out over it would turn a blip into a support queue.
      return NextResponse.next();
    }

    if (!refreshed) return NextResponse.next();

    const response = NextResponse.next();
    const value = serialiseSession(refreshed);
    response.cookies.set(cookieName, value, cookieOptions());
    // Also update the request copy so the page rendering *this* request sees
    // the new token rather than the expiring one it arrived with.
    request.cookies.set(cookieName, value);
    return response;
  };
}
