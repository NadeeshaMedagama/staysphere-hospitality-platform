export interface LockoutPolicy {
  readonly maxFailedAttempts: number;
  readonly lockoutMinutes: number;
}

export interface LockoutState {
  readonly failedLoginCount: number;
  readonly lockedUntil: Date | null;
}

export interface LockoutDecision {
  readonly locked: boolean;
  readonly retryAfterSeconds: number;
}

/**
 * Whether an account is currently locked. Evaluated before the password is
 * verified so a locked account costs an attacker a request without revealing
 * whether the guess was right.
 */
export function evaluateLockout(state: LockoutState, now: Date): LockoutDecision {
  if (!state.lockedUntil || state.lockedUntil <= now) {
    return { locked: false, retryAfterSeconds: 0 };
  }
  return {
    locked: true,
    retryAfterSeconds: Math.ceil((state.lockedUntil.getTime() - now.getTime()) / 1000),
  };
}

/** New counters after a failed sign-in. */
export function registerFailure(
  state: LockoutState,
  policy: LockoutPolicy,
  now: Date,
): LockoutState {
  const failedLoginCount = state.failedLoginCount + 1;
  if (failedLoginCount < policy.maxFailedAttempts) {
    return { failedLoginCount, lockedUntil: null };
  }
  return {
    failedLoginCount,
    lockedUntil: new Date(now.getTime() + policy.lockoutMinutes * 60_000),
  };
}

/** Counters after a successful sign-in — always a clean slate. */
export function registerSuccess(): LockoutState {
  return { failedLoginCount: 0, lockedUntil: null };
}
