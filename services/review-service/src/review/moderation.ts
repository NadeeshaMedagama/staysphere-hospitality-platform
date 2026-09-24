import { ReviewStatus } from '@staysphere/contracts';

export interface ModerationInput {
  readonly title: string | null;
  readonly comment: string | null;
  readonly displayName: string;
}

export type ModerationFlag =
  | 'CONTAINS_CONTACT_DETAILS'
  | 'CONTAINS_URL'
  | 'EXCESSIVE_CAPS'
  | 'REPEATED_CHARACTERS'
  | 'TOO_SHORT'
  | 'PROFANITY';

export interface ModerationResult {
  readonly status: ReviewStatus;
  readonly flags: readonly ModerationFlag[];
  readonly reason: string | null;
}

/**
 * Words that make a review unpublishable as written. Deliberately short and
 * unambiguous — an aggressive list censors legitimate criticism, which is the
 * most useful content on the page.
 */
const PROFANITY = ['fuck', 'shit', 'cunt', 'bastard', 'asshole'];

const URL_PATTERN = /(https?:\/\/|www\.)\S+/i;
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.]+/;
const PHONE_PATTERN = /(?:\+?\d[\d\s()-]{8,}\d)/;

export const MIN_COMMENT_LENGTH = 15;

/**
 * Screens a review before publication.
 *
 * The bias is deliberate: **flag for a human, do not auto-reject.** A negative
 * review is not a policy violation, and silently dropping criticism is both
 * dishonest and, in most jurisdictions, unlawful. Only content that cannot be
 * shown as written — profanity, contact details, link spam — is rejected
 * outright; everything else is held for a person to read.
 */
export function moderate(input: ModerationInput): ModerationResult {
  const flags: ModerationFlag[] = [];
  const text = `${input.title ?? ''} ${input.comment ?? ''}`.trim();
  const lower = text.toLowerCase();

  if (PROFANITY.some((word) => new RegExp(`\\b${word}`, 'i').test(lower))) {
    flags.push('PROFANITY');
  }
  if (URL_PATTERN.test(text)) flags.push('CONTAINS_URL');
  if (EMAIL_PATTERN.test(text) || PHONE_PATTERN.test(text)) {
    flags.push('CONTAINS_CONTACT_DETAILS');
  }

  const letters = text.replace(/[^A-Za-z]/g, '');
  if (letters.length >= 20) {
    const upperRatio = (text.match(/[A-Z]/g)?.length ?? 0) / letters.length;
    if (upperRatio > 0.6) flags.push('EXCESSIVE_CAPS');
  }

  if (/(.)\1{5,}/.test(text)) flags.push('REPEATED_CHARACTERS');

  if (input.comment !== null && input.comment.trim().length > 0) {
    if (input.comment.trim().length < MIN_COMMENT_LENGTH) flags.push('TOO_SHORT');
  }

  const rejecting: ModerationFlag[] = ['PROFANITY', 'CONTAINS_URL', 'CONTAINS_CONTACT_DETAILS'];
  const rejected = flags.filter((flag) => rejecting.includes(flag));

  if (rejected.length > 0) {
    return {
      status: ReviewStatus.REJECTED,
      flags,
      reason: describe(rejected[0] as ModerationFlag),
    };
  }

  if (flags.length > 0) {
    return {
      status: ReviewStatus.PENDING_MODERATION,
      flags,
      reason: 'Held for a moderator to review.',
    };
  }

  // A rating-only review with no prose has nothing to moderate.
  return { status: ReviewStatus.PUBLISHED, flags: [], reason: null };
}

function describe(flag: ModerationFlag): string {
  switch (flag) {
    case 'PROFANITY':
      return 'The review contains language that cannot be published as written.';
    case 'CONTAINS_URL':
      return 'Reviews may not contain links.';
    case 'CONTAINS_CONTACT_DETAILS':
      return 'Reviews may not contain email addresses or phone numbers.';
    default:
      return 'The review was held for moderation.';
  }
}
