import { DomainError, ErrorCode } from '@staysphere/contracts';

export interface PasswordPolicy {
  readonly minLength: number;
  readonly requireUppercase: boolean;
  readonly requireLowercase: boolean;
  readonly requireDigit: boolean;
  readonly requireSymbol: boolean;
}

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireDigit: true,
  requireSymbol: true,
};

/**
 * Passwords that appear in every credential-stuffing list. A short deny-list
 * costs nothing and blocks the passwords attackers try first; it is a floor,
 * not a substitute for rate limiting and lockout.
 */
const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  '123456789',
  'qwertyuiop',
  'letmein123',
  'welcome123',
  'admin12345',
  'iloveyou123',
  'staysphere',
]);

export interface PasswordCheck {
  readonly valid: boolean;
  readonly failures: readonly string[];
}

export function checkPassword(
  password: string,
  policy: PasswordPolicy = DEFAULT_PASSWORD_POLICY,
  context: { email?: string; fullName?: string } = {},
): PasswordCheck {
  const failures: string[] = [];

  if (password.length < policy.minLength) {
    failures.push(`must be at least ${policy.minLength} characters`);
  }
  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    failures.push('must contain an uppercase letter');
  }
  if (policy.requireLowercase && !/[a-z]/.test(password)) {
    failures.push('must contain a lowercase letter');
  }
  if (policy.requireDigit && !/[0-9]/.test(password)) {
    failures.push('must contain a digit');
  }
  if (policy.requireSymbol && !/[^A-Za-z0-9]/.test(password)) {
    failures.push('must contain a symbol');
  }

  const normalised = password.toLowerCase();
  if (COMMON_PASSWORDS.has(normalised)) {
    failures.push('is among the most commonly breached passwords');
  }

  const localPart = context.email?.split('@')[0]?.toLowerCase();
  if (localPart && localPart.length >= 3 && normalised.includes(localPart)) {
    failures.push('must not contain your email address');
  }

  for (const namePart of (context.fullName ?? '').toLowerCase().split(/\s+/)) {
    if (namePart.length >= 3 && normalised.includes(namePart)) {
      failures.push('must not contain your name');
      break;
    }
  }

  return { valid: failures.length === 0, failures };
}

export function assertPasswordAcceptable(
  password: string,
  policy?: PasswordPolicy,
  context?: { email?: string; fullName?: string },
): void {
  const result = checkPassword(password, policy, context);
  if (!result.valid) {
    throw new DomainError(ErrorCode.VALIDATION_FAILED, `Password ${result.failures[0]}.`, {
      details: { failures: result.failures },
    });
  }
}
