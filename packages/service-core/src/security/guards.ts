import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  SetMetadata,
  type CustomDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DomainError, ErrorCode, type Permission, type Role } from '@staysphere/contracts';
import { principalCan, type Principal } from './principal.js';

export const ROLES_KEY = 'staysphere:roles';
export const PERMISSIONS_KEY = 'staysphere:permissions';
export const PUBLIC_KEY = 'staysphere:public';

/** Marks a route as reachable without authentication. */
export const Public = (): CustomDecorator => SetMetadata(PUBLIC_KEY, true);
export const RequireRoles = (...roles: Role[]): CustomDecorator => SetMetadata(ROLES_KEY, roles);
export const RequirePermissions = (...permissions: Permission[]): CustomDecorator =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Authorises the request against the route's declared roles/permissions.
 *
 * Registered globally and opted out of with `@Public()` — a route is protected
 * unless someone deliberately opens it, so forgetting a decorator fails closed.
 */
@Injectable()
export class AuthorizationGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];

    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) return true;

    const request = context.switchToHttp().getRequest<{ principal?: Principal }>();
    const principal = request.principal;
    if (!principal) {
      throw new DomainError(ErrorCode.UNAUTHENTICATED, 'Authentication is required.');
    }

    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, targets) ?? [];
    if (requiredRoles.length > 0 && !requiredRoles.some((r) => principal.roles.includes(r))) {
      throw DomainError.forbidden(`This action requires one of: ${requiredRoles.join(', ')}.`);
    }

    const requiredPermissions =
      this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, targets) ?? [];
    const missing = requiredPermissions.filter((p) => !principalCan(principal, p));
    if (missing.length > 0) {
      throw DomainError.forbidden(`Missing permission(s): ${missing.join(', ')}.`);
    }

    return true;
  }
}
