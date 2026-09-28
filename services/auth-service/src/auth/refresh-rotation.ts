import { DomainError, ErrorCode } from '@staysphere/contracts';
import { createHash } from 'node:crypto';

export interface StoredRefreshToken {
  readonly id: string;
  readonly userId: string;
  readonly sessionId: string;
  readonly tokenHash: string;
  readonly rotatedAt: Date | null;
  readonly revokedAt: Date | null;
  readonly expiresAt: Date;
}

export type RotationOutcome =
  | { readonly kind: 'ROTATE'; readonly sessionId: string; readonly userId: string }
  | { readonly kind: 'REUSE_DETECTED'; readonly sessionId: string; readonly userId: string };

/**
 * Refresh tokens are stored only as a SHA-256 digest.
 *
 * SHA-256 (not Argon2) is deliberate: the token is 256 bits of CSPRNG output,
 * so it is not brute-forcible and a slow KDF would only add latency to the
 * refresh hot path.
 */
export function hashRefreshToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Decides what to do with a presented refresh token.
 *
 * Refresh-token rotation means each token may be exchanged exactly once. If an
 * already-rotated token is presented again, either the legitimate client
 * replayed it or an attacker stole it — the two are indistinguishable, so the
 * safe response is to revoke the entire session and force re-authentication.
 * (OAuth 2.0 Security BCP, §4.14.2.)
 */
export function evaluateRefresh(stored: StoredRefreshToken | null, now: Date): RotationOutcome {
  if (!stored) {
    throw new DomainError(ErrorCode.TOKEN_REVOKED, 'The refresh token is not recognised.');
  }

  if (stored.revokedAt !== null) {
    throw new DomainError(ErrorCode.TOKEN_REVOKED, 'This session has been signed out.');
  }

  if (stored.expiresAt <= now) {
    throw new DomainError(ErrorCode.TOKEN_EXPIRED, 'The refresh token has expired.');
  }

  if (stored.rotatedAt !== null) {
    return { kind: 'REUSE_DETECTED', sessionId: stored.sessionId, userId: stored.userId };
  }

  return { kind: 'ROTATE', sessionId: stored.sessionId, userId: stored.userId };
}

/** Thrown to the caller once a reuse has been handled and the session killed. */
export function reuseDetectedError(): DomainError {
  return new DomainError(
    ErrorCode.REFRESH_TOKEN_REUSED,
    'This session was terminated because a refresh token was replayed. Please sign in again.',
  );
}
