import { RatingCategory } from '@staysphere/contracts';
import { EMPTY_AGGREGATE, aggregateRatings, applyReview, type ScoredReview } from './aggregation';

const review = (overall: number, scores: ScoredReview['scores'] = {}): ScoredReview => ({
  overallRating: overall,
  scores,
});

describe('aggregateRatings', () => {
  it('returns the empty aggregate for a property with no reviews', () => {
    expect(aggregateRatings([])).toEqual(EMPTY_AGGREGATE);
  });

  it('averages the per-review overall scores', () => {
    expect(aggregateRatings([review(5), review(4), review(3)]).overallRating).toBe(4);
  });

  it('rounds the headline figure to one decimal', () => {
    expect(aggregateRatings([review(5), review(4)]).overallRating).toBe(4.5);
    expect(aggregateRatings([review(5), review(4), review(4)]).overallRating).toBe(4.3);
  });

  it('averages each category over only the reviews that scored it', () => {
    // A guest who skipped Facilities must not drag its average toward zero.
    const result = aggregateRatings([
      review(5, { [RatingCategory.CLEANLINESS]: 5, [RatingCategory.FACILITIES]: 3 }),
      review(4, { [RatingCategory.CLEANLINESS]: 4 }),
    ]);
    expect(result.categoryAverages[RatingCategory.CLEANLINESS]).toBe(4.5);
    expect(result.categoryAverages[RatingCategory.FACILITIES]).toBe(3);
  });

  it('omits a category nobody scored', () => {
    const result = aggregateRatings([review(5, { [RatingCategory.CLEANLINESS]: 5 })]);
    expect(result.categoryAverages[RatingCategory.VALUE]).toBeUndefined();
  });

  it('builds the star distribution by rounding each review', () => {
    const result = aggregateRatings([review(4.6), review(4.4), review(1.2)]);
    expect(result.distribution).toEqual({ 1: 1, 2: 0, 3: 0, 4: 1, 5: 1 });
  });

  it('counts every review exactly once in the distribution', () => {
    const reviews = [review(5), review(4.5), review(3.2), review(1)];
    const result = aggregateRatings(reviews);
    const counted = Object.values(result.distribution).reduce((a, b) => a + b, 0);
    expect(counted).toBe(reviews.length);
  });

  it('weights every review equally regardless of how many categories it filled', () => {
    const sparse = aggregateRatings([
      review(5, { [RatingCategory.CLEANLINESS]: 5 }),
      review(1, {
        [RatingCategory.CLEANLINESS]: 1,
        [RatingCategory.STAFF]: 1,
        [RatingCategory.VALUE]: 1,
      }),
    ]);
    expect(sparse.overallRating).toBe(3);
  });
});

describe('applyReview', () => {
  it('folds a new review into an existing aggregate', () => {
    const base = aggregateRatings([review(5), review(3)]);
    const updated = applyReview(base, review(4));
    expect(updated.reviewCount).toBe(3);
    expect(updated.overallRating).toBe(4);
  });

  it('matches a full recompute for the headline figure', () => {
    const reviews = [review(5), review(4), review(3), review(5)];
    const incremental = reviews.reduce(applyReview, EMPTY_AGGREGATE);
    expect(incremental.overallRating).toBe(aggregateRatings(reviews).overallRating);
    expect(incremental.reviewCount).toBe(reviews.length);
  });

  it('updates the distribution', () => {
    const updated = applyReview(EMPTY_AGGREGATE, review(4.7));
    expect(updated.distribution[5]).toBe(1);
  });

  it('handles the first review on an empty aggregate', () => {
    const updated = applyReview(EMPTY_AGGREGATE, review(4));
    expect(updated).toMatchObject({ reviewCount: 1, overallRating: 4 });
  });
});
