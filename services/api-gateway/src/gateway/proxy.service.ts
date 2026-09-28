import { Injectable, Logger } from '@nestjs/common';
import { DomainError, ErrorCode } from '@staysphere/contracts';
import {
  CORRELATION_ID_HEADER,
  REQUEST_ID_HEADER,
  currentContext,
  type Principal,
} from '@staysphere/service-core';
import type { GatewayEnv } from '../config/env.js';
import { buildUpstreamUrl, resolveUpstreamUrl, type RouteDefinition } from './route-table.js';
import { UpstreamRegistry } from './upstream.registry.js';

export interface ProxyRequest {
  readonly method: string;
  readonly path: string;
  readonly query: string;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly body?: unknown;
  readonly principal?: Principal;
}

export interface ProxyResponse {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: unknown;
}

/**
 * Headers that must not be forwarded to an upstream.
 *
 * `x-staysphere-*` are stripped from the *inbound* request specifically so a
 * client cannot forge an identity: only the gateway may set them, after it has
 * verified the token itself.
 */
const STRIPPED_REQUEST_HEADERS = new Set([
  'host',
  'connection',
  'content-length',
  'transfer-encoding',
  'upgrade',
  'x-staysphere-user-id',
  'x-staysphere-user-email',
  'x-staysphere-roles',
  'x-staysphere-hotel-id',
  'x-staysphere-session-id',
]);

const STRIPPED_RESPONSE_HEADERS = new Set([
  'connection',
  'content-encoding',
  'content-length',
  'transfer-encoding',
]);

@Injectable()
export class ProxyService {
  private readonly logger = new Logger(ProxyService.name);

  constructor(
    private readonly upstreams: UpstreamRegistry,
    private readonly env: GatewayEnv,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async forward(route: RouteDefinition, request: ProxyRequest): Promise<ProxyResponse> {
    const baseUrl = resolveUpstreamUrl(route, this.upstreams.registry);
    const target = buildUpstreamUrl(baseUrl, request.path, request.query);
    const breaker = this.upstreams.breakerFor(route.upstream);

    return breaker.execute(async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.env.UPSTREAM_TIMEOUT_MS);

      try {
        const response = await this.fetchImpl(target, {
          method: request.method,
          headers: this.buildHeaders(request),
          ...(request.body !== undefined && request.method !== 'GET' && request.method !== 'HEAD'
            ? { body: JSON.stringify(request.body) }
            : {}),
          signal: controller.signal,
        });

        const text = await response.text();
        return {
          status: response.status,
          headers: filterResponseHeaders(response.headers),
          body: text ? safeJsonParse(text) : null,
        };
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          this.logger.warn({ upstream: route.upstream, target }, 'Upstream request timed out');
          throw new DomainError(
            ErrorCode.UPSTREAM_TIMEOUT,
            `The ${route.upstream} service did not respond in time.`,
            { details: { upstream: route.upstream } },
          );
        }
        throw new DomainError(
          ErrorCode.UPSTREAM_UNAVAILABLE,
          `The ${route.upstream} service is unreachable.`,
          { details: { upstream: route.upstream }, cause: error },
        );
      } finally {
        clearTimeout(timeout);
      }
    });
  }

  /**
   * Builds the upstream request headers.
   *
   * The verified principal is passed as `x-staysphere-*` headers so upstream
   * services need not re-verify the JWT on every hop; the inbound copies of
   * those headers were stripped above, so they can only originate here.
   */
  private buildHeaders(request: ProxyRequest): Record<string, string> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };

    for (const [key, value] of Object.entries(request.headers)) {
      const name = key.toLowerCase();
      if (STRIPPED_REQUEST_HEADERS.has(name) || value === undefined) continue;
      headers[name] = Array.isArray(value) ? value.join(',') : value;
    }

    const context = currentContext();
    if (context) {
      headers[REQUEST_ID_HEADER] = context.requestId;
      headers[CORRELATION_ID_HEADER] = context.correlationId;
    }

    if (request.principal) {
      headers['x-staysphere-user-id'] = request.principal.id;
      headers['x-staysphere-user-email'] = request.principal.email;
      headers['x-staysphere-roles'] = request.principal.roles.join(',');
      headers['x-staysphere-session-id'] = request.principal.sessionId;
      if (request.principal.hotelId) {
        headers['x-staysphere-hotel-id'] = request.principal.hotelId;
      }
    }

    return headers;
  }
}

function filterResponseHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    if (!STRIPPED_RESPONSE_HEADERS.has(key.toLowerCase())) result[key] = value;
  });
  return result;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
