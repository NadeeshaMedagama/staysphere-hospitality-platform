import { ReviewStatus } from '@staysphere/contracts';
import { moderate, type ModerationInput } from './moderation';

const input = (overrides: Partial<ModerationInput> = {}): ModerationInput => ({
  title: 'Lovely stay',
  comment: 'The room was spotless and the staff could not have been more helpful.',
  displayName: 'Nadeesha M.',
  ...overrides,
});

describe('moderate', () => {
  it('publishes an ordinary positive review', () => {
    const result = moderate(input());
    expect(result.status).toBe(ReviewStatus.PUBLISHED);
    expect(result.flags).toEqual([]);
  });

  it('publishes a strongly negative review unchanged', () => {
    // Criticism is the most useful content on the page; suppressing it would be
    // dishonest and, in most jurisdictions, unlawful.
    const result = moderate(
      input({
        title: 'Disappointing',
        comment:
          'The room was dirty, the air conditioning never worked and nobody at reception cared.',
      }),
    );
    expect(result.status).toBe(ReviewStatus.PUBLISHED);
  });

  it('rejects profanity', () => {
    const result = moderate(input({ comment: 'This place is absolute shit, avoid it.' }));
    expect(result.status).toBe(ReviewStatus.REJECTED);
    expect(result.flags).toContain('PROFANITY');
  });

  it('rejects link spam', () => {
    const result = moderate(input({ comment: 'Book cheaper at https://spam.example instead.' }));
    expect(result.status).toBe(ReviewStatus.REJECTED);
    expect(result.flags).toContain('CONTAINS_URL');
  });

  it('rejects contact details', () => {
    expect(
      moderate(input({ comment: 'Email me at guest@example.com for details.' })).flags,
    ).toContain('CONTAINS_CONTACT_DETAILS');
    expect(
      moderate(input({ comment: 'Call me on +94 77 123 4567 to hear more.' })).flags,
    ).toContain('CONTAINS_CONTACT_DETAILS');
  });

  it('holds shouting for a human rather than rejecting it', () => {
    const result = moderate(input({ comment: 'THE WORST HOTEL I HAVE EVER STAYED IN EVER' }));
    expect(result.status).toBe(ReviewStatus.PENDING_MODERATION);
    expect(result.flags).toContain('EXCESSIVE_CAPS');
  });

  it('holds keyboard mashing', () => {
    const result = moderate(input({ comment: 'aaaaaaaaaaaa great place aaaaaaaa' }));
    expect(result.flags).toContain('REPEATED_CHARACTERS');
    expect(result.status).toBe(ReviewStatus.PENDING_MODERATION);
  });

  it('holds a comment too short to be useful', () => {
    const result = moderate(input({ comment: 'Bad.' }));
    expect(result.flags).toContain('TOO_SHORT');
    expect(result.status).toBe(ReviewStatus.PENDING_MODERATION);
  });

  it('publishes a rating-only review with no prose', () => {
    expect(moderate(input({ title: null, comment: null })).status).toBe(ReviewStatus.PUBLISHED);
  });

  it('does not flag ordinary capitalisation or short titles', () => {
    expect(
      moderate(input({ title: 'OK', comment: 'A perfectly reasonable stay overall.' })).flags,
    ).toEqual([]);
  });

  it('gives a rejection reason the guest can act on', () => {
    expect(moderate(input({ comment: 'See https://example.com' })).reason).toMatch(/links/);
  });
});
