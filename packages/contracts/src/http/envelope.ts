import type { ErrorCode } from '../errors/codes.js';

/** Successful response envelope returned by every StaySphere HTTP endpoint. */
export interface ApiSuccess<T> {
  readonly success: true;
  readonly data: T;
  readonly meta?: ResponseMeta;
  readonly requestId: string;
}

/** Failure response envelope returned by every StaySphere HTTP endpoint. */
export interface ApiFailure {
  readonly success: false;
  readonly error: {
    readonly code: ErrorCode;
    readonly message: string;
    readonly details?: Readonly<Record<string, unknown>>;
  };
  readonly requestId: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface ResponseMeta {
  readonly page?: number;
  readonly pageSize?: number;
  readonly totalItems?: number;
  readonly totalPages?: number;
  readonly hasNextPage?: boolean;
}

export function ok<T>(data: T, requestId: string, meta?: ResponseMeta): ApiSuccess<T> {
  return { success: true, data, requestId, ...(meta ? { meta } : {}) };
}

export function fail(
  code: ErrorCode,
  message: string,
  requestId: string,
  details?: Record<string, unknown>,
): ApiFailure {
  return { success: false, error: { code, message, ...(details ? { details } : {}) }, requestId };
}

export function isApiSuccess<T>(response: ApiResponse<T>): response is ApiSuccess<T> {
  return response.success;
}
