import { Injectable, type NestMiddleware } from '@nestjs/common';
import { ALL_ROLES, type Role } from '@staysphere/contracts';
import type { Principal } from '../security/principal.js';

interface MinimalRequest {
  headers: Record<string, string | string[] | undefined>;
  principal?: Principal;
}

export const PRINCIPAL_HEADERS = {
  id: 'x-staysphere-user-id',
  email: 'x-staysphere-user-email',
  roles: 'x-staysphere-roles',
  hotelId: 'x-staysphere-hotel-id',
  sessionId: 'x-staysphere-session-id',
} as const;

/**
 * Reconstructs the principal the gateway already verified.
 *
 * The gateway is the only ingress: it validates the access token once, strips
 * any client-supplied `x-staysphere-*` headers, and re-sets them from the
 * verified claims. Services therefore do not re-verify the JWT on every hop —
 * they read the result.
 *
 * That trust is safe only because two things hold, and both are enforced
 * rather than assumed:
 *
 *   1. The gateway strips these headers from inbound requests, so a client
 *      cannot forge an identity (see `STRIPPED_REQUEST_HEADERS` in the proxy).
 *   2. Network policy permits ingress to a service only from the gateway pod,
 *      so nothing else can present them (see `allow-gateway-to-services`).
 *
 * Without this middleware every authenticated route on every service outside
 * auth-service is unreachable: `AuthorizationGuard` fails closed on a missing
 * principal, so the gateway forwards an identity that nothing ever reads.
 */
@Injectable()
export class ForwardedPrincipalMiddleware implements NestMiddleware {
  use(req: MinimalRequest, _res: unknown, next: () => void): void {
    const id = header(req, PRINCIPAL_HEADERS.id);
    const email = header(req, PRINCIPAL_HEADERS.email);
    const sessionId = header(req, PRINCIPAL_HEADERS.sessionId);
    const rawRoles = header(req, PRINCIPAL_HEADERS.roles);

    // A partial set is not a principal. Leaving it unset makes the guard fail
    // closed, which is the correct outcome for a malformed forward.
    if (!id || !email || !sessionId || !rawRoles) {
      next();
      return;
    }

    const roles = rawRoles
      .split(',')
      .map((role) => role.trim())
      .filter((role): role is Role => (ALL_ROLES as readonly string[]).includes(role));

    if (roles.length === 0) {
      next();
      return;
    }

    const hotelId = header(req, PRINCIPAL_HEADERS.hotelId);
    req.principal = {
      id,
      email,
      roles,
      sessionId,
      ...(hotelId ? { hotelId } : {}),
    };

    next();
  }
}

function header(req: MinimalRequest, name: string): string | undefined {
  const value = req.headers[name];
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}
