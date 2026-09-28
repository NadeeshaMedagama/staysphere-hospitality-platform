import { Injectable, type NestMiddleware } from '@nestjs/common';
import { nanoid } from 'nanoid';
import {
  CORRELATION_ID_HEADER,
  REQUEST_ID_HEADER,
  type RequestContext,
  runWithContext,
} from '../logging/request-context.js';

interface MinimalRequest {
  headers: Record<string, string | string[] | undefined>;
  user?: { id?: string; hotelId?: string; roles?: string[] };
}

interface MinimalResponse {
  setHeader(name: string, value: string): void;
}

/**
 * Establishes the per-request async context. A caller-supplied correlation id is
 * honoured so a request that fans out across services keeps one id end to end;
 * otherwise a fresh one is minted at the edge.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: MinimalRequest, res: MinimalResponse, next: () => void): void {
    const requestId = firstHeader(req.headers[REQUEST_ID_HEADER]) ?? `req_${nanoid(16)}`;
    const correlationId = firstHeader(req.headers[CORRELATION_ID_HEADER]) ?? requestId;

    const context: RequestContext = {
      requestId,
      correlationId,
      ...(req.user?.id ? { userId: req.user.id } : {}),
      ...(req.user?.hotelId ? { hotelId: req.user.hotelId } : {}),
      ...(req.user?.roles ? { roles: req.user.roles } : {}),
    };

    res.setHeader(REQUEST_ID_HEADER, requestId);
    res.setHeader(CORRELATION_ID_HEADER, correlationId);

    runWithContext(context, next);
  }
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}
