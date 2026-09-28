import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  NestInterceptor,
} from '@nestjs/common';
import { ok, type ApiSuccess, type ResponseMeta } from '@staysphere/contracts';
import { map, type Observable } from 'rxjs';
import { currentContext } from '../logging/request-context.js';

/** Marker a handler can return to attach pagination metadata to the envelope. */
export interface WithMeta<T> {
  readonly data: T;
  readonly meta: ResponseMeta;
}

function hasMeta<T>(value: unknown): value is WithMeta<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'data' in value &&
    'meta' in value &&
    Object.keys(value).length === 2
  );
}

/**
 * Wraps every successful handler result in the shared success envelope so
 * controllers stay free of transport concerns and clients see one shape.
 */
@Injectable()
export class ResponseEnvelopeInterceptor<T> implements NestInterceptor<T, ApiSuccess<T>> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<ApiSuccess<T>> {
    const requestId = currentContext()?.requestId ?? 'unknown';
    return next
      .handle()
      .pipe(
        map((payload) =>
          hasMeta<T>(payload) ? ok(payload.data, requestId, payload.meta) : ok(payload, requestId),
        ),
      );
  }
}
