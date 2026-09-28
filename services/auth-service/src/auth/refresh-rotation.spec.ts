import { ErrorCode } from '@staysphere/contracts';
import {
  evaluateRefresh,
  hashRefreshToken,
  reuseDetectedError,
  type StoredRefreshToken,
} from './refresh-rotation';

const now = new Date('2026-09-08T10:00:00.000Z');

function token(overrides: Partial<StoredRefreshToken> = {}): StoredRefreshToken {
  return {
    id: 'rt_1',
    userId: 'usr_1',
    sessionId: 'ses_1',
    tokenHash: 'hash',
    rotatedAt: null,
    revokedAt: null,
    expiresAt: new Date('2026-10-08T10:00:00.000Z'),
    ...overrides,
  };
}

describe('hashRefreshToken', () => {
  it('produces a stable 64-character SHA-256 digest', () => {
    const digest = hashRefreshToken('a-refresh-token');
    expect(digest).toHaveLength(64);
    expect(hashRefreshToken('a-refresh-token')).toBe(digest);
  });

  it('produces different digests for different tokens', () => {
    expect(hashRefreshToken('token-a')).not.toBe(hashRefreshToken('token-b'));
  });
});

describe('evaluateRefresh', () => {
  it('rotates a valid, unused token', () => {
    expect(evaluateRefresh(token(), now)).toEqual({
      kind: 'ROTATE',
      sessionId: 'ses_1',
      userId: 'usr_1',
    });
  });

  it('rejects an unknown token without revealing why', () => {
    expect(() => evaluateRefresh(null, now)).toThrow(
      expect.objectContaining({ code: ErrorCode.TOKEN_REVOKED }),
    );
  });

  it('rejects a token from a signed-out session', () => {
    expect(() => evaluateRefresh(token({ revokedAt: now }), now)).toThrow(
      expect.objectContaining({ code: ErrorCode.TOKEN_REVOKED }),
    );
  });

  it('rejects an expired token', () => {
    const expired = token({ expiresAt: new Date('2026-09-08T09:59:59.000Z') });
    expect(() => evaluateRefresh(expired, now)).toThrow(
      expect.objectContaining({ code: ErrorCode.TOKEN_EXPIRED }),
    );
  });

  it('treats a token expiring exactly now as expired', () => {
    expect(() => evaluateRefresh(token({ expiresAt: now }), now)).toThrow(
      expect.objectContaining({ code: ErrorCode.TOKEN_EXPIRED }),
    );
  });

  it('flags replay of an already-rotated token', () => {
    const rotated = token({ rotatedAt: new Date('2026-09-08T09:30:00.000Z') });
    expect(evaluateRefresh(rotated, now)).toEqual({
      kind: 'REUSE_DETECTED',
      sessionId: 'ses_1',
      userId: 'usr_1',
    });
  });

  it('prefers revocation over reuse when a token is both', () => {
    const both = token({ rotatedAt: now, revokedAt: now });
    expect(() => evaluateRefresh(both, now)).toThrow(
      expect.objectContaining({ code: ErrorCode.TOKEN_REVOKED }),
    );
  });
});

describe('reuseDetectedError', () => {
  it('surfaces REFRESH_TOKEN_REUSED so clients can force a fresh sign-in', () => {
    expect(reuseDetectedError().code).toBe(ErrorCode.REFRESH_TOKEN_REUSED);
  });
});
