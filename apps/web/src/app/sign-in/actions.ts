'use server';

import { redirect } from 'next/navigation';
import type { Route } from 'next';
import {
  login,
  logout,
  safeRedirect,
  signInMessage,
  validateCredentials,
  type SignInState,
} from '@staysphere/app-core';
import { guestSession } from '@/lib/session';

export type { SignInState };

export async function signInAction(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const destination = safeRedirect(formData.get('next'), '/bookings');

  const fieldErrors = validateCredentials(email, password);
  if (fieldErrors) return { fieldErrors, email };

  const result = await login(email, password);
  if (!result.ok) return { error: signInMessage(result.code, result.message), email };

  await guestSession.setSession(result.data);

  // Outside any try/catch on purpose: `redirect` signals by throwing, and
  // catching it here would swallow the navigation and render the form again.
  // `typedRoutes` cannot check a value that only exists at runtime; the guard
  // in `safeRedirect` is the check that matters, and an unknown same-site path
  // renders the app's own 404 rather than leaving the site.
  redirect(destination as Route);
}

export async function signOutAction(): Promise<void> {
  const session = await guestSession.clearSession();

  // Best effort: the cookie is already gone, so the guest is signed out of this
  // browser either way. Revoking server-side additionally kills the refresh
  // token, which matters if the cookie was ever copied elsewhere.
  if (session) await logout(session.accessToken);

  redirect('/');
}
