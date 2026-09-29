import { describe, expect, it } from 'vitest';
import { Permission, Role, STAFF_ROLES, hasPermission, permissionsForRoles } from './roles.js';

describe('role/permission matrix', () => {
  it('grants a super admin every permission', () => {
    const all = Object.values(Permission);
    expect(permissionsForRoles([Role.SUPER_ADMIN])).toEqual(expect.arrayContaining(all));
  });

  it('never grants a customer system administration', () => {
    expect(hasPermission([Role.CUSTOMER], Permission.SYSTEM_ADMIN)).toBe(false);
    expect(hasPermission([Role.CUSTOMER], Permission.STAFF_MANAGE)).toBe(false);
  });

  it('lets a customer manage only their own booking surface', () => {
    expect(hasPermission([Role.CUSTOMER], Permission.BOOKING_WRITE)).toBe(true);
    expect(hasPermission([Role.CUSTOMER], Permission.PAYMENT_REFUND)).toBe(false);
  });

  it('unions permissions when a principal holds several roles', () => {
    const merged = permissionsForRoles([Role.RECEPTIONIST, Role.FINANCE]);
    expect(merged).toContain(Permission.BOOKING_WRITE);
    expect(merged).toContain(Permission.PAYMENT_REFUND);
  });

  it('de-duplicates overlapping permissions', () => {
    const merged = permissionsForRoles([Role.RECEPTIONIST, Role.MANAGER]);
    expect(new Set(merged).size).toBe(merged.length);
  });

  it('excludes CUSTOMER from the staff role set', () => {
    expect(STAFF_ROLES).not.toContain(Role.CUSTOMER);
    expect(STAFF_ROLES).toHaveLength(Object.values(Role).length - 1);
  });
});
