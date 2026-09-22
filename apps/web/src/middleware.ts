import { createRefreshMiddleware } from '@staysphere/app-core';
import { guestSession } from '@/lib/session';

export const middleware = createRefreshMiddleware(
  guestSession.cookieName,
  guestSession.cookieOptions,
);

export const config = {
  /**
   * Everything except Next's own assets and static files. Running the refresh
   * check on image and font requests would multiply it by every asset on the
   * page for no benefit.
   *
   * Written out here rather than imported: Next statically analyses this
   * object at build time and rejects an identifier it cannot resolve, which
   * fails the production build while dev mode runs happily.
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
