import { type ArgumentsHost, Catch, HttpException, Logger, ExceptionFilter } from '@nestjs/common';
import { DomainError, ErrorCode, fail, httpStatusFor } from '@staysphere/contracts';
import { ZodError } from 'zod';
import { currentContext } from '../logging/request-context.js';

/**
 * Terminal error boundary. Everything a service can throw is normalised into the
 * one wire format documented in `docs/architecture/api-conventions.md`, so a
 * client never has to special-case which service produced a failure.
 *
 * Unexpected errors are logged in full but reported generically — internal
 * messages (and anything they might quote, such as a connection string) never
 * reach the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<{ status(code: number): { json(body: unknown): void } }>();
    const requestId = currentContext()?.requestId ?? 'unknown';

    const { status, code, message, details } = this.normalise(exception);

    if (status >= 500) {
      this.logger.error(
        { err: exception, code, requestId },
        `Unhandled error while serving request ${requestId}`,
      );
    } else {
      this.logger.warn({ code, status, requestId }, message);
    }

    response.status(status).json(fail(code, message, requestId, details));
  }

  private normalise(exception: unknown): {
    status: number;
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  } {
    if (exception instanceof DomainError) {
      return {
        status: exception.status,
        code: exception.code,
        message: exception.message,
        ...(exception.details ? { details: { ...exception.details } } : {}),
      };
    }

    if (exception instanceof ZodError) {
      return {
        status: httpStatusFor(ErrorCode.VALIDATION_FAILED),
        code: ErrorCode.VALIDATION_FAILED,
        message: 'The request payload failed validation.',
        details: {
          issues: exception.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      return {
        status,
        code: mapHttpStatusToCode(status),
        message: extractMessage(body) ?? exception.message,
      };
    }

    return {
      status: 500,
      code: ErrorCode.INTERNAL_ERROR,
      message: 'An unexpected error occurred. The incident has been logged.',
    };
  }
}

function mapHttpStatusToCode(status: number): ErrorCode {
  switch (status) {
    case 400:
      return ErrorCode.VALIDATION_FAILED;
    case 401:
      return ErrorCode.UNAUTHENTICATED;
    case 403:
      return ErrorCode.FORBIDDEN;
    case 404:
      return ErrorCode.NOT_FOUND;
    case 409:
      return ErrorCode.CONFLICT;
    case 429:
      return ErrorCode.RATE_LIMITED;
    case 503:
      return ErrorCode.UPSTREAM_UNAVAILABLE;
    case 504:
      return ErrorCode.UPSTREAM_TIMEOUT;
    default:
      return status >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.VALIDATION_FAILED;
  }
}

function extractMessage(body: unknown): string | undefined {
  if (typeof body === 'string') return body;
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message: unknown }).message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.join('; ');
  }
  return undefined;
}
