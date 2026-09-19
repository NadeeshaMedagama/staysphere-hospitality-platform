import { DomainError, ErrorCode } from '@staysphere/contracts';

export const INVOICE_SEQUENCE_WIDTH = 6;

/**
 * Formats an invoice number as `<PREFIX>-<YEAR>-<SEQUENCE>`, e.g.
 * `SG-2026-000042`.
 *
 * The sequence is zero-padded so invoices sort correctly as text — in a
 * spreadsheet, in a filename, and in any accounting import that treats the
 * number as a string.
 */
export function formatInvoiceNumber(prefix: string, year: number, sequence: number): string {
  if (!/^[A-Z0-9]{2,8}$/.test(prefix)) {
    throw DomainError.validation('An invoice prefix must be 2–8 uppercase letters or digits.', {
      prefix,
    });
  }
  if (year < 2000 || year > 2999) {
    throw DomainError.validation('Invoice year is out of range.', { year });
  }
  if (sequence < 1 || sequence > 999_999) {
    throw new DomainError(ErrorCode.CONFLICT, 'The invoice sequence for this year is exhausted.', {
      details: { year, sequence },
    });
  }
  return `${prefix}-${year}-${String(sequence).padStart(INVOICE_SEQUENCE_WIDTH, '0')}`;
}

export interface ParsedInvoiceNumber {
  readonly prefix: string;
  readonly year: number;
  readonly sequence: number;
}

export function parseInvoiceNumber(value: string): ParsedInvoiceNumber | null {
  const match = /^([A-Z0-9]{2,8})-(\d{4})-(\d{6})$/.exec(value.trim().toUpperCase());
  if (!match) return null;
  return {
    prefix: match[1] as string,
    year: Number(match[2]),
    sequence: Number(match[3]),
  };
}

/** Derives a default prefix from a property name, e.g. "Seaside Grand" → "SG". */
export function derivePrefix(hotelName: string): string {
  const initials = hotelName
    .split(/\s+/)
    .filter((word) => /^[A-Za-z0-9]/.test(word))
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')
    .replace(/[^A-Z0-9]/g, '');

  if (initials.length >= 2) return initials.slice(0, 8);

  // A single-word name falls back to its first letters.
  const fallback = hotelName
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 3);
  if (fallback.length >= 2) return fallback;

  throw DomainError.validation('Could not derive an invoice prefix from the property name.', {
    hotelName,
  });
}
