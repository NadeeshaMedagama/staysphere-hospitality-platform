import { ALL_RATING_CATEGORIES, type RatingCategory } from '@staysphere/contracts';

export interface ScoredReview {
  readonly overallRating: number;
  readonly scores: Readonly<Partial<Record<RatingCategory, number>>>;
}

export interface RatingAggregate {
  readonly reviewCount: number;
  readonly overallRating: number;
  readonly categoryAverages: Readonly<Partial<Record<RatingCategory, number>>>;
  /** Count per whole-star value, for the distribution bar. */
  readonly distribution: Readonly<Record<1 | 2 | 3 | 4 | 5, number>>;
}

export const EMPTY_AGGREGATE: RatingAggregate = {
  reviewCount: 0,
  overallRating: 0,
  categoryAverages: {},
  distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
};

/**
 * Recomputes a property's rating from its published reviews.
 *
 * Each category is averaged over the reviews that actually scored it, not over
 * all reviews: a guest who skipped "Facilities" should not drag that average
 * toward zero. The headline figure is the mean of the per-review overalls, so
 * every review carries equal weight regardless of how many categories it filled
 * in.
 */
export function aggregateRatings(reviews: readonly ScoredReview[]): RatingAggregate {
  if (reviews.length === 0) return EMPTY_AGGREGATE;

  const overallMean =
    reviews.reduce((sum, review) => sum + review.overallRating, 0) / reviews.length;

  const categoryAverages: Partial<Record<RatingCategory, number>> = {};
  for (const category of ALL_RATING_CATEGORIES) {
    const scored = reviews
      .map((review) => review.scores[category])
      .filter((value): value is number => typeof value === 'number');
    if (scored.length > 0) {
      categoryAverages[category] =
        Math.round((scored.reduce((sum, value) => sum + value, 0) / scored.length) * 10) / 10;
    }
  }

  const distribution: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const review of reviews) {
    // Round to the nearest star, clamped into range.
    const star = Math.min(5, Math.max(1, Math.round(review.overallRating))) as 1 | 2 | 3 | 4 | 5;
    distribution[star] += 1;
  }

  return {
    reviewCount: reviews.length,
    overallRating: Math.round(overallMean * 10) / 10,
    categoryAverages,
    distribution,
  };
}

/**
 * Applies an aggregate incrementally.
 *
 * Recomputing from every review is correct but becomes a full table scan once a
 * property has thousands. This folds one new review into an existing aggregate
 * in constant time; the full recompute stays available for a nightly reconcile.
 */
export function applyReview(aggregate: RatingAggregate, review: ScoredReview): RatingAggregate {
  const reviewCount = aggregate.reviewCount + 1;
  const overallRating =
    Math.round(
      ((aggregate.overallRating * aggregate.reviewCount + review.overallRating) / reviewCount) * 10,
    ) / 10;

  const star = Math.min(5, Math.max(1, Math.round(review.overallRating))) as 1 | 2 | 3 | 4 | 5;

  return {
    reviewCount,
    overallRating,
    // Category means are left to the periodic recompute: doing them
    // incrementally would need a per-category count, and the drift is not worth
    // the extra state.
    categoryAverages: aggregate.categoryAverages,
    distribution: { ...aggregate.distribution, [star]: aggregate.distribution[star] + 1 },
  };
}
