import {
  REFERENCE_PREFIX,
  generateReference,
  isValidReference,
  normaliseReference,
} from './reference';

describe('generateReference', () => {
  it('produces a prefixed six-character reference', () => {
    const reference = generateReference(() => 0);
    expect(reference).toBe('SS-222222');
    expect(reference).toHaveLength(9);
  });

  it('only ever emits characters from the unambiguous alphabet', () => {
    let counter = 0;
    const reference = generateReference((max) => counter++ % max);
    expect(reference).toMatch(/^SS-[23456789ACDEFGHJKMNPQRTUVWXYZ]{6}$/);
  });

  it('excludes characters that are misread when dictated', () => {
    let counter = 0;
    const bodies = Array.from({ length: 60 }, () =>
      generateReference((max) => counter++ % max).slice(REFERENCE_PREFIX.length),
    ).join('');
    for (const ambiguous of ['0', 'O', '1', 'I', 'L', 'S', 'B']) {
      expect(bodies.includes(ambiguous)).toBe(false);
    }
  });
});

describe('isValidReference', () => {
  it('accepts a well-formed reference', () => {
    expect(isValidReference('SS-4KD9QW')).toBe(true);
  });

  it('rejects a missing prefix, wrong length, or ambiguous characters', () => {
    expect(isValidReference('4KD9QW')).toBe(false);
    expect(isValidReference('SS-4KD9Q')).toBe(false);
    expect(isValidReference('SS-4KD9Q0')).toBe(false);
    expect(isValidReference('SS-4KD9QO')).toBe(false);
  });
});

describe('normaliseReference', () => {
  it('accepts what a guest actually types', () => {
    expect(normaliseReference('ss-4kd9qw')).toBe('SS-4KD9QW');
    expect(normaliseReference(' 4kd9qw ')).toBe('SS-4KD9QW');
    expect(normaliseReference('SS 4KD 9QW')).toBe('SS-4KD9QW');
  });
});
