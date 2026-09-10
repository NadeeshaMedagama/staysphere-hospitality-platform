import { type CanActivate, Injectable, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DomainError, ErrorCode } from '@staysphere/contracts';
import { PUBLIC_KEY, accessTokenClaimsSchema, toPrincipal } from '@staysphere/service-core';
import { TokenService } from './token.service.js';

/**
 * Verifies the bearer token and attaches the resolved principal to the request.
 * Runs before AuthorizationGuard, which then evaluates roles and permissions.
 */
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined>; principal?: unknown }>();

    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new DomainError(ErrorCode.UNAUTHENTICATED, 'A bearer access token is required.');
    }

    try {
      const claims = accessTokenClaimsSchema.parse(
        await this.tokens.verifyAccessToken(header.slice('Bearer '.length)),
      );
      request.principal = toPrincipal(claims);
      return true;
    } catch (error) {
      if (error instanceof Error && /expired/i.test(error.message)) {
        throw new DomainError(ErrorCode.TOKEN_EXPIRED, 'The access token has expired.');
      }
      throw new DomainError(ErrorCode.UNAUTHENTICATED, 'The access token is not valid.');
    }
  }
}
