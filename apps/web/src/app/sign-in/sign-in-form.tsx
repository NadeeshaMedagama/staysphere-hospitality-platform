'use client';

import { useActionState, useId } from 'react';
import { useFormStatus } from 'react-dom';
import { signInAction, type SignInState } from './actions';

const INITIAL: SignInState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-brand-600 hover:bg-brand-700 w-full rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Signing in…' : 'Sign in'}
    </button>
  );
}

/**
 * The sign-in form.
 *
 * Submits to a server action rather than calling the gateway from the browser,
 * which is what keeps the tokens out of client-side JavaScript: they are set as
 * an httpOnly cookie on the action's response and the browser never sees them.
 * It also means the form still works with JavaScript disabled.
 */
export function SignInForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState(signInAction, INITIAL);
  const ids = useId();
  const emailId = `${ids}-email`;
  const passwordId = `${ids}-password`;
  const errorId = `${ids}-error`;

  return (
    <form
      action={formAction}
      noValidate
      className="rounded-card border-sand-200 space-y-4 border bg-white p-6"
    >
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {state.error ? (
        <p
          id={errorId}
          // `alert` announces the failure immediately; without it a screen
          // reader user gets no indication that the submit did anything.
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800"
        >
          {state.error}
        </p>
      ) : null}

      <div>
        <label htmlFor={emailId} className="text-ink-900 block text-sm font-medium">
          Email address
        </label>
        <input
          id={emailId}
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.email}
          aria-invalid={state.fieldErrors?.email ? true : undefined}
          aria-describedby={state.fieldErrors?.email ? `${emailId}-error` : undefined}
          className="border-sand-200 bg-sand-50 focus:border-brand-500 mt-1.5 w-full rounded-lg border px-3 py-2.5 text-sm outline-none"
        />
        {state.fieldErrors?.email ? (
          <p id={`${emailId}-error`} className="mt-1.5 text-sm text-red-700">
            {state.fieldErrors.email}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor={passwordId} className="text-ink-900 block text-sm font-medium">
          Password
        </label>
        <input
          id={passwordId}
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={state.fieldErrors?.password ? true : undefined}
          aria-describedby={state.fieldErrors?.password ? `${passwordId}-error` : undefined}
          className="border-sand-200 bg-sand-50 focus:border-brand-500 mt-1.5 w-full rounded-lg border px-3 py-2.5 text-sm outline-none"
        />
        {state.fieldErrors?.password ? (
          <p id={`${passwordId}-error`} className="mt-1.5 text-sm text-red-700">
            {state.fieldErrors.password}
          </p>
        ) : null}
      </div>

      <SubmitButton />
    </form>
  );
}
