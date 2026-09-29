/**
 * Platform roles. Authorisation is role-based; each role maps to a fixed
 * permission set so services never need to call back to the auth service
 * to answer "may this principal do X?".
 */
export const Role = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  HOTEL_ADMIN: 'HOTEL_ADMIN',
  MANAGER: 'MANAGER',
  RECEPTIONIST: 'RECEPTIONIST',
  HOUSEKEEPING: 'HOUSEKEEPING',
  MAINTENANCE: 'MAINTENANCE',
  FINANCE: 'FINANCE',
  CUSTOMER: 'CUSTOMER',
} as const;

export type Role = (typeof Role)[keyof typeof Role];

export const ALL_ROLES: readonly Role[] = Object.values(Role);

/** Roles that operate the hotel from the inside (i.e. everything except guests). */
export const STAFF_ROLES: readonly Role[] = ALL_ROLES.filter((r) => r !== Role.CUSTOMER);

export const Permission = {
  BOOKING_READ: 'booking:read',
  BOOKING_WRITE: 'booking:write',
  BOOKING_CANCEL: 'booking:cancel',
  ROOM_READ: 'room:read',
  ROOM_WRITE: 'room:write',
  RATE_WRITE: 'rate:write',
  PAYMENT_READ: 'payment:read',
  PAYMENT_REFUND: 'payment:refund',
  STAFF_MANAGE: 'staff:manage',
  HOUSEKEEPING_MANAGE: 'housekeeping:manage',
  MAINTENANCE_MANAGE: 'maintenance:manage',
  REPORT_READ: 'report:read',
  AUDIT_READ: 'audit:read',
  SYSTEM_ADMIN: 'system:admin',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

const P = Permission;

/**
 * Static role → permission matrix. Kept in the contracts package so the gateway,
 * every service and both front-ends resolve authorisation identically.
 */
export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  [Role.SUPER_ADMIN]: Object.values(P),
  [Role.HOTEL_ADMIN]: [
    P.BOOKING_READ,
    P.BOOKING_WRITE,
    P.BOOKING_CANCEL,
    P.ROOM_READ,
    P.ROOM_WRITE,
    P.RATE_WRITE,
    P.PAYMENT_READ,
    P.PAYMENT_REFUND,
    P.STAFF_MANAGE,
    P.HOUSEKEEPING_MANAGE,
    P.MAINTENANCE_MANAGE,
    P.REPORT_READ,
    P.AUDIT_READ,
  ],
  [Role.MANAGER]: [
    P.BOOKING_READ,
    P.BOOKING_WRITE,
    P.BOOKING_CANCEL,
    P.ROOM_READ,
    P.ROOM_WRITE,
    P.RATE_WRITE,
    P.PAYMENT_READ,
    P.HOUSEKEEPING_MANAGE,
    P.MAINTENANCE_MANAGE,
    P.REPORT_READ,
  ],
  [Role.RECEPTIONIST]: [
    P.BOOKING_READ,
    P.BOOKING_WRITE,
    P.BOOKING_CANCEL,
    P.ROOM_READ,
    P.PAYMENT_READ,
  ],
  [Role.HOUSEKEEPING]: [P.ROOM_READ, P.HOUSEKEEPING_MANAGE],
  [Role.MAINTENANCE]: [P.ROOM_READ, P.MAINTENANCE_MANAGE],
  [Role.FINANCE]: [P.BOOKING_READ, P.PAYMENT_READ, P.PAYMENT_REFUND, P.REPORT_READ],
  [Role.CUSTOMER]: [P.BOOKING_READ, P.BOOKING_WRITE, P.BOOKING_CANCEL, P.ROOM_READ],
};

export function permissionsForRoles(roles: readonly Role[]): Permission[] {
  const set = new Set<Permission>();
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role] ?? []) set.add(permission);
  }
  return [...set];
}

export function hasPermission(roles: readonly Role[], permission: Permission): boolean {
  return roles.some((role) => ROLE_PERMISSIONS[role]?.includes(permission));
}
