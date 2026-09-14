import { describe, expect, it } from 'vitest';
import { ErrorCode, httpStatusFor } from './codes.js';
import { DomainError, isDomainError } from './domain-error.js';

describe('DomainError', () => {
  it('derives the HTTP status from the code', () => {
    expect(new DomainError(ErrorCode.ROOM_NOT_AVAILABLE, 'gone').status).toBe(409);
    expect(new DomainError(ErrorCode.PAYMENT_DECLINED, 'declined').status).toBe(402);
    expect(new DomainError(ErrorCode.CIRCUIT_OPEN, 'open').status).toBe(503);
  });

  it('maps every declared code to a status', () => {
    for (const code of Object.values(ErrorCode)) {
      expect(httpStatusFor(code), `no status mapped for ${code}`).toBeGreaterThanOrEqual(400);
    }
  });

  it('keeps the cause out of the serialised body', () => {
    const error = new DomainError(ErrorCode.INTERNAL_ERROR, 'boom', {
      cause: new Error('DSN=postgres://user:secret@host/db'),
      details: { retriable: true },
    });
    expect(JSON.stringify(error.toJSON())).not.toContain('secret');
    expect(error.toJSON().details).toEqual({ retriable: true });
  });

  it('omits the details key entirely when there are none', () => {
    expect(new DomainError(ErrorCode.NOT_FOUND, 'nope').toJSON()).not.toHaveProperty('details');
  });

  it('exposes helpful factories', () => {
    const err = DomainError.notFound('Booking', 'bkg_1');
    expect(err.code).toBe(ErrorCode.NOT_FOUND);
    expect(err.message).toBe("Booking 'bkg_1' was not found.");
    expect(isDomainError(err)).toBe(true);
    expect(isDomainError(new Error('plain'))).toBe(false);
  });
});
