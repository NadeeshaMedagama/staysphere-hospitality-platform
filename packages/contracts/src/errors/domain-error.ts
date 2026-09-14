import { ErrorCode, httpStatusFor } from './codes.js';

export interface DomainErrorOptions {
  /** Structured, safe-to-expose detail (field paths, ids, limits). */
  readonly details?: Readonly<Record<string, unknown>>;
  /** Original error, retained for logging only — never serialised to clients. */
  readonly cause?: unknown;
}

/**
 * The single error type every StaySphere service throws. Transport adapters
 * (HTTP filter, RPC interceptor) translate it into the shared error envelope,
 * so the wire format cannot drift between services.
 */
export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(code: ErrorCode, message: string, options: DomainErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = 'DomainError';
    this.code = code;
    this.status = httpStatusFor(code);
    this.details = options.details;
    Error.captureStackTrace?.(this, DomainError);
  }

  static notFound(resource: string, id: string): DomainError {
    return new DomainError(ErrorCode.NOT_FOUND, `${resource} '${id}' was not found.`, {
      details: { resource, id },
    });
  }

  static conflict(message: string, details?: Record<string, unknown>): DomainError {
    return new DomainError(ErrorCode.CONFLICT, message, { details });
  }

  static forbidden(message = 'You do not have permission to perform this action.'): DomainError {
    return new DomainError(ErrorCode.FORBIDDEN, message);
  }

  static validation(message: string, details?: Record<string, unknown>): DomainError {
    return new DomainError(ErrorCode.VALIDATION_FAILED, message, { details });
  }

  toJSON(): { code: ErrorCode; message: string; details?: Record<string, unknown> } {
    return {
      code: this.code,
      message: this.message,
      ...(this.details ? { details: { ...this.details } } : {}),
    };
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}
