import { ErrorCode } from '@staysphere/contracts';
import { isValidSlug, resolveSlug, slugify } from './slug';

describe('slugify', () => {
  it('lowercases and hyphenates a property name', () => {
    expect(slugify('Seaside Grand Colombo')).toBe('seaside-grand-colombo');
  });

  it('folds diacritics rather than stripping them', () => {
    expect(slugify('Hôtel Café Münster')).toBe('hotel-cafe-munster');
  });

  it('drops apostrophes without leaving a gap', () => {
    expect(slugify("O'Malley's Inn")).toBe('omalleys-inn');
  });

  it('collapses punctuation runs into a single hyphen', () => {
    expect(slugify('The  Grand -- Hotel & Spa!!')).toBe('the-grand-hotel-spa');
  });

  it('never leaves a leading or trailing hyphen', () => {
    expect(slugify('  --Grand Hotel--  ')).toBe('grand-hotel');
  });

  it('truncates without leaving a trailing hyphen', () => {
    const slug = slugify('a'.repeat(80));
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('isValidSlug', () => {
  it('accepts a well-formed slug', () => {
    expect(isValidSlug('seaside-grand')).toBe(true);
  });

  it('rejects a slug that is too short', () => {
    expect(isValidSlug('ab')).toBe(false);
  });

  it('rejects doubled or edge hyphens', () => {
    expect(isValidSlug('sea--side')).toBe(false);
    expect(isValidSlug('-seaside')).toBe(false);
    expect(isValidSlug('seaside-')).toBe(false);
  });

  it('rejects a slug that would collide with a platform route', () => {
    for (const reserved of ['api', 'admin', 'bookings', 'rooms', 'health']) {
      // A reserved word must never become a property address.
      expect({ reserved, valid: isValidSlug(reserved) }).toEqual({ reserved, valid: false });
    }
  });
});

describe('resolveSlug', () => {
  it('returns the base slug when it is free', () => {
    expect(resolveSlug('Seaside Grand', new Set())).toBe('seaside-grand');
  });

  it('appends a readable counter when the base is taken', () => {
    expect(resolveSlug('Seaside Grand', new Set(['seaside-grand']))).toBe('seaside-grand-2');
  });

  it('keeps counting past the first collision', () => {
    const taken = new Set(['seaside-grand', 'seaside-grand-2', 'seaside-grand-3']);
    expect(resolveSlug('Seaside Grand', taken)).toBe('seaside-grand-4');
  });

  it('rejects a name that cannot produce a usable address', () => {
    expect(() => resolveSlug('!!!', new Set())).toThrow(
      expect.objectContaining({ code: ErrorCode.VALIDATION_FAILED }),
    );
  });

  it('rejects a name that reduces to a reserved word', () => {
    expect(() => resolveSlug('Admin', new Set())).toThrow(
      expect.objectContaining({ code: ErrorCode.VALIDATION_FAILED }),
    );
  });
});
