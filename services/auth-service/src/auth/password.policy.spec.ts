import {
  DEFAULT_PASSWORD_POLICY,
  assertPasswordAcceptable,
  checkPassword,
} from './password.policy';

describe('checkPassword', () => {
  const strong = 'Tr0pic@l-Reef-2026';

  it('accepts a password meeting every rule', () => {
    expect(checkPassword(strong)).toEqual({ valid: true, failures: [] });
  });

  it('reports each unmet rule rather than only the first', () => {
    const result = checkPassword('short');
    expect(result.valid).toBe(false);
    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.stringContaining('at least 12 characters'),
        'must contain an uppercase letter',
        'must contain a digit',
        'must contain a symbol',
      ]),
    );
  });

  it('rejects commonly breached passwords even when long enough', () => {
    expect(checkPassword('password123').failures).toContain(
      'is among the most commonly breached passwords',
    );
  });

  it('rejects a password containing the email local part', () => {
    expect(
      checkPassword('Nadeesha-Str0ng!', DEFAULT_PASSWORD_POLICY, {
        email: 'nadeesha@example.com',
      }).failures,
    ).toContain('must not contain your email address');
  });

  it('rejects a password containing the user name', () => {
    expect(
      checkPassword('Medagama-2026!x', DEFAULT_PASSWORD_POLICY, {
        fullName: 'Nadeesha Medagama',
      }).failures,
    ).toContain('must not contain your name');
  });

  it('ignores very short name fragments to avoid false positives', () => {
    expect(checkPassword(strong, DEFAULT_PASSWORD_POLICY, { fullName: 'Al Fe' }).valid).toBe(true);
  });

  it('honours a relaxed policy', () => {
    const relaxed = { ...DEFAULT_PASSWORD_POLICY, minLength: 8, requireSymbol: false };
    expect(checkPassword('Passw0rdy', relaxed).valid).toBe(true);
  });
});

describe('assertPasswordAcceptable', () => {
  it('throws a VALIDATION_FAILED domain error carrying every failure', () => {
    expect.assertions(2);
    try {
      assertPasswordAcceptable('weak');
    } catch (error) {
      const domainError = error as { code: string; details?: { failures: string[] } };
      expect(domainError.code).toBe('VALIDATION_FAILED');
      expect(domainError.details?.failures.length).toBeGreaterThan(1);
    }
  });

  it('is silent for an acceptable password', () => {
    expect(() => assertPasswordAcceptable('Tr0pic@l-Reef-2026')).not.toThrow();
  });
});
