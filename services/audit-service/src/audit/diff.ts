export interface FieldChange {
  readonly field: string;
  readonly before: unknown;
  readonly after: unknown;
}

/**
 * Fields whose values must never be written to the audit log.
 *
 * The audit trail is widely readable — by definition, since its purpose is
 * oversight. Recording a password hash or a token here would turn the log into
 * the most attractive table in the platform.
 */
const REDACTED_FIELDS = new Set([
  'password',
  'passwordhash',
  'currentpassword',
  'newpassword',
  'token',
  'accesstoken',
  'refreshtoken',
  'tokenhash',
  'secret',
  'apikey',
  'authorization',
  'cardnumber',
  'cvv',
  'pan',
  'ssn',
  'taxnumber',
]);

export const REDACTED = '[REDACTED]';

export function isRedactedField(field: string): boolean {
  const normalised = field.toLowerCase().replace(/[_-]/g, '');
  if (REDACTED_FIELDS.has(normalised)) return true;
  // Catch compound names such as `user.passwordHash` or `newRefreshToken`.
  return [...REDACTED_FIELDS].some((sensitive) => normalised.includes(sensitive));
}

export interface DiffOptions {
  /** Fields to leave out of the diff entirely, e.g. `updatedAt`. */
  readonly ignore?: readonly string[];
  readonly maxDepth?: number;
}

const DEFAULT_IGNORED = ['updatedAt', 'createdAt', 'version'];

/**
 * Produces a field-level diff of two versions of a record.
 *
 * Only fields that actually changed are recorded — a full before-and-after
 * snapshot of every row would make the log unreadable and enormous, and the
 * question an auditor asks is "what changed?", not "what did the row look like?".
 *
 * Sensitive values are replaced rather than omitted, so the log still shows
 * *that* a password changed without showing what it changed to.
 */
export function diffRecords(
  before: Readonly<Record<string, unknown>> | null,
  after: Readonly<Record<string, unknown>> | null,
  options: DiffOptions = {},
): FieldChange[] {
  const ignore = new Set([...DEFAULT_IGNORED, ...(options.ignore ?? [])]);
  const maxDepth = options.maxDepth ?? 3;
  const changes: FieldChange[] = [];

  const walk = (
    left: Record<string, unknown> | null,
    right: Record<string, unknown> | null,
    prefix: string,
    depth: number,
  ): void => {
    const keys = new Set([...Object.keys(left ?? {}), ...Object.keys(right ?? {})]);

    for (const key of keys) {
      if (ignore.has(key)) continue;

      const path = prefix ? `${prefix}.${key}` : key;
      const beforeValue = left?.[key];
      const afterValue = right?.[key];

      if (isRedactedField(path)) {
        if (!deepEqual(beforeValue, afterValue)) {
          changes.push({ field: path, before: REDACTED, after: REDACTED });
        }
        continue;
      }

      const bothPlainObjects =
        isPlainObject(beforeValue) && isPlainObject(afterValue) && depth < maxDepth;

      if (bothPlainObjects) {
        walk(
          beforeValue as Record<string, unknown>,
          afterValue as Record<string, unknown>,
          path,
          depth + 1,
        );
        continue;
      }

      if (!deepEqual(beforeValue, afterValue)) {
        changes.push({ field: path, before: normalise(beforeValue), after: normalise(afterValue) });
      }
    }
  };

  walk(before as Record<string, unknown> | null, after as Record<string, unknown> | null, '', 0);
  return changes.sort((a, b) => a.field.localeCompare(b.field));
}

/** Renders a change the way an audit reader expects: `Price: $100 → $125`. */
export function describeChange(change: FieldChange): string {
  return `${change.field}: ${format(change.before)} → ${format(change.after)}`;
}

function format(value: unknown): string {
  if (value === undefined || value === null) return '(none)';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function normalise(value: unknown): unknown {
  if (value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)
  );
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  return JSON.stringify(a) === JSON.stringify(b);
}
