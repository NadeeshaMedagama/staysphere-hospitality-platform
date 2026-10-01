import { createSessionStore } from '@staysphere/app-core';

/**
 * Session for the guest site.
 *
 * The name is distinct from the console's and the staff app's because cookies
 * are scoped by host and ignore the port: on a developer's machine all three
 * front ends are `localhost`, so a shared name would have them overwrite each
 * other's sessions.
 */
export const guestSession = createSessionStore('staysphere_guest_session');

export const { getSession } = guestSession;
