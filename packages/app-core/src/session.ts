// No `server-only` guard is needed here: this module imports `next/headers`,
// which Next refuses to bundle into a client component, so an accidental
// import from the browser half of an app fails the build rather than shipping
// the refresh token to it.
import { cookies } from 'next/headers';
import type { Role } from '@staysphere/contracts';

/** The account behind the current request, as the auth service describes it. */
export interface SessionUser {
  readonly id: string;
  readonly email: string;
  readonly fullName: string;
  readonly roles: readonly Role[];
  readonly hotelId: string | null;
  readonly status: string;
}

export interface Session {
  readonly user: SessionUser;
  readonly accessToken: string;
  readonly refreshToken: string;
  /** ISO timestamp after which the access token is no longer accepted. */
  readonly accessTokenExpiresAt: string;
}

/** Shape the auth service returns from `/auth/login`, `/register` and `/refresh`. */
export interface AuthenticatedResult {
  readonly user: SessionUser;
  readonly tokens: {
    readonly accessToken: string;
    readonly refreshToken: string;
    readonly accessTokenExpiresAt: string;
    readonly refreshTokenExpiresAt: string;
  };
}

export interface SessionCookieOptions {
  readonly httpOnly: true;
  readonly sameSite: 'lax';
  readonly secure: boolean;
  readonly path: '/';
  readonly maxAge: number;
}

/**
 * Matches the refresh token's own lifetime. A cookie that outlives the token
 * inside it only produces a signed-in-looking header that 401s on first use.
 */
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export function parseSession(raw: string | undefined): Session | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Session>;
    // A cookie whose shape predates a deploy is treated as absent rather than
    // trusted field-by-field; the visitor simply signs in again.
    if (!parsed?.accessToken || !parsed.refreshToken || !parsed.user?.id) return null;
    return parsed as Session;
  } catch {
    return null;
  }
}

export function serialiseSession(result: AuthenticatedResult): string {
  const session: Session = {
    user: result.user,
    accessToken: result.tokens.accessToken,
    refreshToken: result.tokens.refreshToken,
    accessTokenExpiresAt: result.tokens.accessTokenExpiresAt,
  };
  return JSON.stringify(session);
}

/**
 * True once the access token is close enough to expiry that the next call would
 * likely 401. Refreshing is only possible where cookies can be written — a
 * server action, a route handler or middleware — never during a page render.
 */
export function needsRefresh(session: Session, skewMs = 60_000): boolean {
  const expiresAt = Date.parse(session.accessTokenExpiresAt);
  return Number.isNaN(expiresAt) || expiresAt - Date.now() <= skewMs;
}

/**
 * Builds the session helpers for one front end.
 *
 * The cookie name is per-app on purpose. Cookies are scoped by host and ignore
 * the port, so the guest site on :3100 and the console on :3200 are the *same*
 * cookie origin in local development — a single shared name would mean signing
 * into the console silently replaced the guest's session, and vice versa.
 */
export function createSessionStore(cookieName: string) {
  /**
   * Tokens live in an httpOnly cookie, never in `localStorage`.
   *
   * The refresh token is valid for thirty days, so script-readable storage
   * would turn any injected script — an analytics tag, a compromised
   * dependency — into a month-long account takeover. httpOnly keeps it out of
   * reach of JavaScript entirely; `sameSite: lax` keeps it off cross-site
   * requests while still surviving a normal top-level navigation into the app.
   */
  function cookieOptions(): SessionCookieOptions {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SESSION_MAX_AGE_SECONDS,
    };
  }

  /** Reads the session for the current request, or null when signed out. */
  async function getSession(): Promise<Session | null> {
    const store = await cookies();
    return parseSession(store.get(cookieName)?.value);
  }

  async function setSession(result: AuthenticatedResult): Promise<void> {
    const store = await cookies();
    store.set(cookieName, serialiseSession(result), cookieOptions());
  }

  async function clearSession(): Promise<Session | null> {
    const store = await cookies();
    const existing = parseSession(store.get(cookieName)?.value);
    store.delete(cookieName);
    return existing;
  }

  return { cookieName, cookieOptions, getSession, setSession, clearSession } as const;
}

export type SessionStore = ReturnType<typeof createSessionStore>;
