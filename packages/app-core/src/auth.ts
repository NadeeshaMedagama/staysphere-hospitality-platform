import { ErrorCode } from '@staysphere/contracts';
import { gatewayFetch } from './gateway';
import type { AuthenticatedResult } from './session';

/** Exchanges credentials for a token pair at the gateway. */
export function login(email: string, password: string) {
  return gatewayFetch<AuthenticatedResult>('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
}

/** Rotates a refresh token for a fresh pair. */
export function refresh(refreshToken: string) {
  return gatewayFetch<AuthenticatedResult>('/auth/refresh', {
    method: 'POST',
    body: { refreshToken },
  });
}

/** Revokes the current session server-side. */
export function logout(accessToken: string) {
  return gatewayFetch<void>('/auth/logout', { method: 'POST', accessToken });
}

/**
 * Turns a service error code into something the person signing in can act on.
 *
 * A wrong password and an unknown email deliberately share one message: saying
 * which was wrong turns the form into an oracle for testing whether an address
 * has an account here.
 */
export function signInMessage(code: ErrorCode, fallback: string): string {
  switch (code) {
    case ErrorCode.INVALID_CREDENTIALS:
      return 'That email address and password do not match an account.';
    case ErrorCode.NOT_FOUND:
      // Deliberately not folded into the line above. The auth service answers
      // an unknown email with INVALID_CREDENTIALS, so a NOT_FOUND here means
      // the *route* is missing — a wrong NEXT_PUBLIC_API_URL, or a gateway
      // without this endpoint. Reporting that as a bad password sends whoever
      // is signing in to reset a password that was never wrong.
      return 'Sign-in is not reachable: the server has no endpoint at this address.';
    case ErrorCode.ACCOUNT_LOCKED:
      return 'This account is temporarily locked after too many attempts. Try again shortly.';
    case ErrorCode.ACCOUNT_DISABLED:
      return 'This account has been disabled. Contact an administrator for help.';
    case ErrorCode.EMAIL_NOT_VERIFIED:
      return 'Confirm your email address using the link we sent, then sign in.';
    case ErrorCode.RATE_LIMITED:
      return 'Too many sign-in attempts. Wait a moment and try again.';
    case ErrorCode.VALIDATION_FAILED:
      return 'Check the details entered and try again.';
    case ErrorCode.UPSTREAM_UNAVAILABLE:
    case ErrorCode.UPSTREAM_TIMEOUT:
    case ErrorCode.CIRCUIT_OPEN:
      return 'Sign-in is unavailable right now. Please try again in a moment.';
    default:
      return fallback;
  }
}

/**
 * Validates a post-sign-in destination.
 *
 * Only same-site absolute paths are honoured: taking an arbitrary `next` value
 * from the query string and redirecting to it is an open redirect, which is
 * exactly the primitive a credential-phishing link needs. `//evil.test` is
 * rejected too — it is protocol-relative, not a local path.
 */
export function safeRedirect(target: unknown, fallback: string): string {
  const value = typeof target === 'string' ? target : '';
  if (!value.startsWith('/') || value.startsWith('//')) return fallback;
  return value;
}

/** Shared shape for the `useActionState` value behind every sign-in form. */
export interface SignInState {
  readonly error?: string;
  readonly fieldErrors?: Readonly<Record<string, string>>;
  readonly email?: string;
}

/** Field-level validation shared by the sign-in forms. */
export function validateCredentials(
  email: string,
  password: string,
): Record<string, string> | null {
  const fieldErrors: Record<string, string> = {};
  if (!email) fieldErrors.email = 'Enter the email address on your account.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fieldErrors.email = 'Enter a valid email address.';
  }
  if (!password) fieldErrors.password = 'Enter your password.';
  return Object.keys(fieldErrors).length > 0 ? fieldErrors : null;
}
