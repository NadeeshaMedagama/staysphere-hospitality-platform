import { z } from 'zod';
import { ALL_ROLES, type Permission, type Role, hasPermission } from '@staysphere/contracts';

/** Claims carried by a StaySphere access token. */
export const accessTokenClaimsSchema = z.object({
  sub: z.string(),
  email: z.string().email(),
  roles: z.array(z.enum(ALL_ROLES as unknown as [Role, ...Role[]])).min(1),
  hotelId: z.string().optional(),
  /** Session id — lets a single session be revoked without rotating all keys. */
  sid: z.string(),
  iss: z.string(),
  aud: z.string(),
  iat: z.number().int(),
  exp: z.number().int(),
});

export type AccessTokenClaims = z.infer<typeof accessTokenClaimsSchema>;

export interface Principal {
  readonly id: string;
  readonly email: string;
  readonly roles: readonly Role[];
  readonly hotelId?: string;
  readonly sessionId: string;
}

export function toPrincipal(claims: AccessTokenClaims): Principal {
  return {
    id: claims.sub,
    email: claims.email,
    roles: claims.roles,
    ...(claims.hotelId ? { hotelId: claims.hotelId } : {}),
    sessionId: claims.sid,
  };
}

export function principalCan(principal: Principal, permission: Permission): boolean {
  return hasPermission(principal.roles, permission);
}
