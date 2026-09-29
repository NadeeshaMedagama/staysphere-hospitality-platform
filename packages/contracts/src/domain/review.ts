/** Aspects a guest scores independently, 1–5. */
export const RatingCategory = {
  CLEANLINESS: 'CLEANLINESS',
  STAFF: 'STAFF',
  COMFORT: 'COMFORT',
  LOCATION: 'LOCATION',
  FACILITIES: 'FACILITIES',
  VALUE: 'VALUE',
} as const;

export type RatingCategory = (typeof RatingCategory)[keyof typeof RatingCategory];

export const ALL_RATING_CATEGORIES: readonly RatingCategory[] = Object.values(RatingCategory);

export const ReviewStatus = {
  PENDING_MODERATION: 'PENDING_MODERATION',
  PUBLISHED: 'PUBLISHED',
  REJECTED: 'REJECTED',
  HIDDEN: 'HIDDEN',
} as const;

export type ReviewStatus = (typeof ReviewStatus)[keyof typeof ReviewStatus];

export const MIN_RATING = 1;
export const MAX_RATING = 5;

/**
 * Overall score from the per-category scores, rounded to one decimal.
 *
 * An unweighted mean is deliberate: weighting categories would let a property
 * game its headline score by optimising whichever aspect carried the most
 * weight.
 */
export function overallRating(scores: Readonly<Partial<Record<RatingCategory, number>>>): number {
  const values = ALL_RATING_CATEGORIES.map((category) => scores[category]).filter(
    (value): value is number => typeof value === 'number',
  );
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.round(mean * 10) / 10;
}

export function isValidRating(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_RATING && value <= MAX_RATING;
}
