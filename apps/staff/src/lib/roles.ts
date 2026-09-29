import { Role } from '@staysphere/contracts';

/**
 * The staff app is one deployment with several workspaces, not several apps.
 *
 * A duty manager covers reception at breakfast and inspects rooms at eleven;
 * making them sign into two products to do one shift is how staff end up
 * sharing a single admin login, which destroys the audit trail.
 *
 * Declared `as const` so `href` keeps its literal type — Next.js's typed routes
 * reject a plain `string`, which is exactly the check that catches a nav entry
 * pointing at a page nobody built.
 */
export const WORKSPACES = [
  {
    id: 'reception',
    href: '/reception',
    label: 'Reception',
    description: 'Arrivals, departures, walk-ins and the in-house register.',
    roles: [Role.RECEPTIONIST, Role.MANAGER, Role.HOTEL_ADMIN, Role.SUPER_ADMIN],
  },
  {
    id: 'housekeeping',
    href: '/housekeeping',
    label: 'Housekeeping',
    description: 'Your cleaning round, checklists and inspections.',
    roles: [Role.HOUSEKEEPING, Role.MANAGER, Role.HOTEL_ADMIN, Role.SUPER_ADMIN],
  },
  {
    id: 'maintenance',
    href: '/maintenance',
    label: 'Maintenance',
    description: 'Engineering tickets by priority and time to breach.',
    roles: [Role.MAINTENANCE, Role.MANAGER, Role.HOTEL_ADMIN, Role.SUPER_ADMIN],
  },
  {
    id: 'finance',
    href: '/finance',
    label: 'Finance',
    description: 'Payments, refunds, invoices and outstanding balances.',
    roles: [Role.FINANCE, Role.MANAGER, Role.HOTEL_ADMIN, Role.SUPER_ADMIN],
  },
] as const;

export type Workspace = (typeof WORKSPACES)[number];

export function workspacesFor(roles: readonly Role[]): Workspace[] {
  return WORKSPACES.filter((workspace) =>
    workspace.roles.some((allowed) => roles.includes(allowed)),
  );
}

export function canAccess(workspaceId: string, roles: readonly Role[]): boolean {
  const workspace = WORKSPACES.find((candidate) => candidate.id === workspaceId);
  if (!workspace) return false;
  return workspace.roles.some((allowed) => roles.includes(allowed));
}

/**
 * Where a member of staff should land when they open the app.
 *
 * Their own workspace, not a menu: someone starting a shift wants their queue,
 * and a chooser between one option is friction.
 */
export function defaultWorkspace(roles: readonly Role[]): Workspace | null {
  return workspacesFor(roles)[0] ?? null;
}
