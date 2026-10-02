import { DomainError, ErrorCode } from '@staysphere/contracts';

/** Words that would collide with a platform route if used as a property slug. */
const RESERVED_SLUGS = new Set([
  'api',
  'admin',
  'auth',
  'login',
  'signin',
  'sign-in',
  'bookings',
  'rooms',
  'offers',
  'search',
  'health',
  'metrics',
  'docs',
  'static',
  'assets',
  'new',
  'edit',
]);

export const MIN_SLUG_LENGTH = 3;
export const MAX_SLUG_LENGTH = 60;

/**
 * Derives a URL-safe slug from a property name.
 *
 * Diacritics are folded rather than stripped, so "Hôtel Café" becomes
 * "hotel-cafe" instead of "htel-caf" — the difference between a readable link
 * and a broken one for any property outside the ASCII range.
 */
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');
}

export function isValidSlug(slug: string): boolean {
  return (
    slug.length >= MIN_SLUG_LENGTH &&
    slug.length <= MAX_SLUG_LENGTH &&
    /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) &&
    !RESERVED_SLUGS.has(slug)
  );
}

/**
 * Finds a free slug, appending `-2`, `-3`, … when the base is taken.
 *
 * The suffix is a readable counter rather than a random string: a guest reads
 * the URL, and `seaside-grand-2` is comprehensible where `seaside-grand-x7f2`
 * is not.
 */
export function resolveSlug(name: string, taken: ReadonlySet<string>): string {
  const base = slugify(name);

  if (!isValidSlug(base)) {
    throw new DomainError(
      ErrorCode.VALIDATION_FAILED,
      'The property name does not produce a usable web address. Provide a slug explicitly.',
      { details: { name, derived: base } },
    );
  }

  if (!taken.has(base)) return base;

  for (let suffix = 2; suffix <= 999; suffix += 1) {
    const candidate = `${base.slice(0, MAX_SLUG_LENGTH - String(suffix).length - 1)}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }

  throw new DomainError(
    ErrorCode.CONFLICT,
    'Could not derive a unique web address for this property name.',
    { details: { name, base } },
  );
}
