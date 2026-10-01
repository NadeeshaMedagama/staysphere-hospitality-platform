import { redirect } from 'next/navigation';
import { Role } from '@staysphere/contracts';
import { createSessionStore, type Session } from '@staysphere/app-core';

/**
 * Session for the staff app.
 *
 * The name is distinct from the guest site's and the console's because cookies
 * are scoped by host and ignore the port: on a developer's machine all three
 * front ends are `localhost`, so a shared name would have them overwrite each
 * other's sessions.
 */
export const staffSession = createSessionStore('staysphere_staff_session');

export const { getSession } = staffSession;

/** The app is for staff; a guest token authenticates but grants no workspace. */
export function isStaff(session: Session): boolean {
  return session.user.roles.some((role) => role !== Role.CUSTOMER);
}

/**
 * Returns the signed-in staff session, or sends the visitor to sign in.
 *
 * Middleware already turns an unauthenticated request away with the path it was
 * aiming for, so reaching this redirect means something bypassed it. It is kept
 * anyway: an app that depends on exactly one check is one matcher edit away
 * from serving every page to anyone.
 */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session || !isStaff(session)) redirect('/sign-in');
  return session;
}

/** First letter of each of the first two words, e.g. "Duty Manager" → "DM". */
export function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || '?';
}
