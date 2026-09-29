import { describe, expect, it } from 'vitest';
import { RatingCategory, isValidRating, overallRating } from './review.js';

describe('overallRating', () => {
  it('averages every supplied category', () => {
    expect(
      overallRating({
        [RatingCategory.CLEANLINESS]: 5,
        [RatingCategory.STAFF]: 5,
        [RatingCategory.COMFORT]: 4,
        [RatingCategory.LOCATION]: 5,
        [RatingCategory.FACILITIES]: 4,
        [RatingCategory.VALUE]: 4,
      }),
    ).toBe(4.5);
  });

  it('ignores categories the guest skipped', () => {
    expect(overallRating({ [RatingCategory.CLEANLINESS]: 5, [RatingCategory.STAFF]: 4 })).toBe(4.5);
  });

  it('returns zero when nothing was scored', () => {
    expect(overallRating({})).toBe(0);
  });

  it('rounds to a single decimal place', () => {
    expect(
      overallRating({
        [RatingCategory.CLEANLINESS]: 5,
        [RatingCategory.STAFF]: 4,
        [RatingCategory.COMFORT]: 4,
      }),
    ).toBe(4.3);
  });

  it('weights every category equally, so no single aspect can lift the score', () => {
    const cleanOnly = overallRating({
      [RatingCategory.CLEANLINESS]: 5,
      [RatingCategory.VALUE]: 1,
    });
    const valueOnly = overallRating({
      [RatingCategory.CLEANLINESS]: 1,
      [RatingCategory.VALUE]: 5,
    });
    expect(cleanOnly).toBe(valueOnly);
  });
});

describe('isValidRating', () => {
  it('accepts whole numbers between one and five', () => {
    expect([1, 2, 3, 4, 5].every(isValidRating)).toBe(true);
  });

  it('rejects out-of-range and fractional scores', () => {
    expect(isValidRating(0)).toBe(false);
    expect(isValidRating(6)).toBe(false);
    expect(isValidRating(4.5)).toBe(false);
  });
});
