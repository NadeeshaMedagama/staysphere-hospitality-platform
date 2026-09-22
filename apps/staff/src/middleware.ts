import { NextResponse, type NextRequest } from 'next/server';
import { Role } from '@staysphere/contracts';
import {
  createRefreshMiddleware,
  parseSession,
} from '@staysphere/app-core';
import { staffSession } from '@/lib/session';

const refresh = createRefreshMiddleware(staffSession.cookieName, staffSession.cookieOptions);

/** Paths that must stay reachable without a session, or sign-in would loop. */
const PUBLIC_PATHS = ['/sign-in', '/api/health'];

export async function middleware(request: NextRequest): Promise<NextResponse> {
  // Refresh first: a request arriving with an expiring token should be judged
  // on the token it ends up with, not the one it came in on.
  const response = await refresh(request);
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return response;
  }

  const session = parseSession(request.cookies.get(staffSession.cookieName)?.value);
  const staff = session?.user.roles.some((role) => role !== Role.CUSTOMER) ?? false;

  if (!session || !staff) {
    // Redirecting here rather than in the layout is what makes the destination
    // knowable: a server component cannot see the URL it renders for.
    const target = request.nextUrl.clone();
    target.pathname = '/sign-in';
    target.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname)}`;
    const redirect = NextResponse.redirect(target);
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }

  return response;
}

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
