'use server';

import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { Role } from '@staysphere/contracts';
import {
  login,
  logout,
  safeRedirect,
  signInMessage,
  validateCredentials,
  type SignInState,
} from '@staysphere/app-core';
import { staffSession } from '@/lib/session';

export type { SignInState };

export async function signInAction(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const destination = safeRedirect(formData.get('next'), '/');

  const fieldErrors = validateCredentials(email, password);
  if (fieldErrors) return { fieldErrors, email };

  const result = await login(email, password);
  if (!result.ok) return { error: signInMessage(result.code, result.message), email };

  // A guest account authenticates perfectly well and has no business here. The
  // session is never created, so a customer cannot reach the console even
  // momentarily, and the message does not confirm the credentials were right.
  const staff = result.data.user.roles.some((role) => role !== Role.CUSTOMER);
  if (!staff) {
    return { error: 'This account does not have access to the staff app.', email };
  }

  await staffSession.setSession(result.data);

  // Outside any try/catch on purpose: `redirect` signals by throwing, and
  // catching it here would swallow the navigation. `typedRoutes` cannot check
  // a value that only exists at runtime; `safeRedirect` is the check that
  // matters, and an unknown same-site path renders the console's own 404.
  redirect(destination as Route);
}

export async function signOutAction(): Promise<void> {
  const session = await staffSession.clearSession();

  // Best effort: the cookie is already gone, so this browser is signed out
  // either way. Revoking server-side additionally kills the refresh token.
  if (session) await logout(session.accessToken);

  redirect('/sign-in');
}
