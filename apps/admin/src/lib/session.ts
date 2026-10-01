import { redirect } from 'next/navigation';
import { Role, type Permission, hasPermission } from '@staysphere/contracts';
import { createSessionStore, type Session } from '@staysphere/app-core';

/**
 * Session for the operations console.
 *
 * The name is distinct from the guest site's because cookies are scoped by host
 * and ignore the port: on a developer's machine both front ends are
 * `localhost`, so a shared name would have them overwrite each other.
 */
export const adminSession = createSessionStore('staysphere_admin_session');

export const { getSession } = adminSession;

/**
 * The console is for staff. A guest account holds a perfectly valid token, so
 * authentication alone is not the bar — it has to be an account with a role
 * that operates the hotel.
 */
function isStaff(session: Session): boolean {
  return session.user.roles.some((role) => role !== Role.CUSTOMER);
}

/**
 * Returns the signed-in staff session, or sends the visitor to sign in.
 *
 * Middleware already turns an unauthenticated request away with the path it was
 * aiming for, so reaching this redirect means something bypassed it. It is kept
 * anyway: a console that depends on exactly one check is one matcher edit away
 * from serving every page to anyone.
 */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session || !isStaff(session)) redirect('/sign-in');
  return session;
}

/** Guards a section behind a permission the role matrix actually grants. */
export function can(session: Session, permission: Permission): boolean {
  return hasPermission(session.user.roles, permission);
}
