import { ErrorCode } from '@staysphere/contracts';
import { derivePrefix, formatInvoiceNumber, parseInvoiceNumber } from './invoice-number';

describe('formatInvoiceNumber', () => {
  it('zero-pads the sequence so numbers sort as text', () => {
    expect(formatInvoiceNumber('SG', 2026, 42)).toBe('SG-2026-000042');
    expect(formatInvoiceNumber('SG', 2026, 1)).toBe('SG-2026-000001');
  });

  it('sorts correctly across magnitudes', () => {
    const numbers = [9, 100, 1_000].map((n) => formatInvoiceNumber('SG', 2026, n));
    expect([...numbers].sort()).toEqual(numbers);
  });

  it('rejects a malformed prefix', () => {
    expect(() => formatInvoiceNumber('s', 2026, 1)).toThrow();
    expect(() => formatInvoiceNumber('sg', 2026, 1)).toThrow();
    expect(() => formatInvoiceNumber('SEASIDE-GRAND', 2026, 1)).toThrow();
  });

  it('rejects an out-of-range year', () => {
    expect(() => formatInvoiceNumber('SG', 1999, 1)).toThrow();
  });

  it('fails loudly when the yearly sequence is exhausted', () => {
    expect(() => formatInvoiceNumber('SG', 2026, 1_000_000)).toThrow(
      expect.objectContaining({ code: ErrorCode.CONFLICT }),
    );
  });

  it('rejects a zero or negative sequence', () => {
    expect(() => formatInvoiceNumber('SG', 2026, 0)).toThrow();
  });
});

describe('parseInvoiceNumber', () => {
  it('round-trips a formatted number', () => {
    expect(parseInvoiceNumber(formatInvoiceNumber('SG', 2026, 42))).toEqual({
      prefix: 'SG',
      year: 2026,
      sequence: 42,
    });
  });

  it('accepts lowercase and surrounding whitespace', () => {
    expect(parseInvoiceNumber('  sg-2026-000042  ')?.sequence).toBe(42);
  });

  it('returns null for anything malformed', () => {
    expect(parseInvoiceNumber('SG-2026-42')).toBeNull();
    expect(parseInvoiceNumber('INVOICE 42')).toBeNull();
  });
});

describe('derivePrefix', () => {
  it('uses the initials of a multi-word name', () => {
    expect(derivePrefix('Seaside Grand')).toBe('SG');
    expect(derivePrefix('The Grand Hotel Colombo')).toBe('TGHC');
  });

  it('falls back to the first letters of a single-word name', () => {
    expect(derivePrefix('Marina')).toBe('MAR');
  });

  it('strips punctuation', () => {
    expect(derivePrefix("O'Malley's Inn")).toBe('OI');
  });

  it('caps the prefix at eight characters', () => {
    expect(derivePrefix('A B C D E F G H I J').length).toBeLessThanOrEqual(8);
  });

  it('rejects a name it cannot derive a prefix from', () => {
    expect(() => derivePrefix('!')).toThrow();
  });
});
