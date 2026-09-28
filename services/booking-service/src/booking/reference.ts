/**
 * Booking references are read aloud over the phone and typed off a printout,
 * so the alphabet omits characters that are routinely confused: 0/O, 1/I/L,
 * 5/S, 8/B. Six characters over this 28-symbol alphabet gives ~481 million
 * combinations — ample, and short enough to dictate.
 */
const ALPHABET = '23456789ACDEFGHJKMNPQRTUVWXYZ';
export const REFERENCE_PREFIX = 'SS-';
export const REFERENCE_BODY_LENGTH = 6;

export type RandomInt = (maxExclusive: number) => number;

export function generateReference(randomInt: RandomInt): string {
  let body = '';
  for (let i = 0; i < REFERENCE_BODY_LENGTH; i += 1) {
    body += ALPHABET[randomInt(ALPHABET.length)];
  }
  return `${REFERENCE_PREFIX}${body}`;
}

export function isValidReference(value: string): boolean {
  if (!value.startsWith(REFERENCE_PREFIX)) return false;
  const body = value.slice(REFERENCE_PREFIX.length);
  return (
    body.length === REFERENCE_BODY_LENGTH && [...body].every((char) => ALPHABET.includes(char))
  );
}

/** Normalises guest input: uppercase, and forgiving about the prefix and spaces. */
export function normaliseReference(input: string): string {
  const cleaned = input.trim().toUpperCase().replace(/[\s-]/g, '');
  const body = cleaned.startsWith('SS') ? cleaned.slice(2) : cleaned;
  return `${REFERENCE_PREFIX}${body}`;
}
