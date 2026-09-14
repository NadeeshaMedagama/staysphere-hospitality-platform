import { type CanActivate, Injectable, type ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DomainError, ErrorCode } from '@staysphere/contracts';
import { accessTokenClaimsSchema, toPrincipal } from '@staysphere/service-core';
import type { GatewayEnv } from '../config/env.js';
import { isGatewayOwnedPath, matchRoute, stripApiPrefix } from './route-table.js';

/**
 * Edge authentication.
 *
 * The token is verified once here and the resolved principal is attached to the
 * request. Upstream services still enforce their own authorisation — the
 * gateway decides *whether a request may enter*, not what it may do.
 */
@Injectable()
export class EdgeAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly env: GatewayEnv,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      originalUrl?: string;
      url: string;
      headers: Record<string, string | undefined>;
      principal?: unknown;
      route?: unknown;
    }>();

    const rawPath = request.originalUrl ?? request.url;

    // Health, readiness, metrics and docs are served by this process. They
    // are not routes in the table, so evaluating them against it would
    // reject every probe.
    if (isGatewayOwnedPath(rawPath)) return true;

    const path = stripApiPrefix(rawPath);
    const route = matchRoute(path);

    if (!route) {
      throw new DomainError(ErrorCode.NOT_FOUND, `No route is configured for '${path}'.`);
    }

    const header = request.headers.authorization;

    // A public route still resolves the principal when a token is present, so
    // an authenticated guest sees personalised results without a second call.
    if (!header?.startsWith('Bearer ')) {
      if (route.public) return true;
      throw new DomainError(ErrorCode.UNAUTHENTICATED, 'A bearer access token is required.');
    }

    try {
      const claims = accessTokenClaimsSchema.parse(
        await this.jwt.verifyAsync(header.slice('Bearer '.length), {
          secret: this.env.JWT_ACCESS_SECRET,
          issuer: this.env.JWT_ISSUER,
          audience: this.env.JWT_AUDIENCE,
        }),
      );
      request.principal = toPrincipal(claims);
      return true;
    } catch (error) {
      if (route.public) return true;
      if (error instanceof Error && /expired/i.test(error.message)) {
        throw new DomainError(ErrorCode.TOKEN_EXPIRED, 'The access token has expired.');
      }
      throw new DomainError(ErrorCode.UNAUTHENTICATED, 'The access token is not valid.');
    }
  }
}
