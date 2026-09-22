import { evaluateLockout, registerFailure, registerSuccess } from './lockout';

const policy = { maxFailedAttempts: 5, lockoutMinutes: 15 };
const now = new Date('2026-09-08T10:00:00.000Z');

describe('evaluateLockout', () => {
  it('permits sign-in when the account was never locked', () => {
    expect(evaluateLockout({ failedLoginCount: 3, lockedUntil: null }, now)).toEqual({
      locked: false,
      retryAfterSeconds: 0,
    });
  });

  it('permits sign-in once the lock has elapsed', () => {
    const lockedUntil = new Date('2026-09-08T09:59:59.000Z');
    expect(evaluateLockout({ failedLoginCount: 5, lockedUntil }, now).locked).toBe(false);
  });

  it('blocks sign-in while locked and reports the wait', () => {
    const lockedUntil = new Date('2026-09-08T10:05:30.000Z');
    expect(evaluateLockout({ failedLoginCount: 5, lockedUntil }, now)).toEqual({
      locked: true,
      retryAfterSeconds: 330,
    });
  });
});

describe('registerFailure', () => {
  it('increments without locking below the threshold', () => {
    expect(registerFailure({ failedLoginCount: 2, lockedUntil: null }, policy, now)).toEqual({
      failedLoginCount: 3,
      lockedUntil: null,
    });
  });

  it('locks exactly at the threshold', () => {
    const next = registerFailure({ failedLoginCount: 4, lockedUntil: null }, policy, now);
    expect(next.failedLoginCount).toBe(5);
    expect(next.lockedUntil).toEqual(new Date('2026-09-08T10:15:00.000Z'));
  });

  it('extends the lock on a further failure', () => {
    const next = registerFailure({ failedLoginCount: 6, lockedUntil: null }, policy, now);
    expect(next.lockedUntil).toEqual(new Date('2026-09-08T10:15:00.000Z'));
  });
});

describe('registerSuccess', () => {
  it('clears both the counter and the lock', () => {
    expect(registerSuccess()).toEqual({ failedLoginCount: 0, lockedUntil: null });
  });
});
