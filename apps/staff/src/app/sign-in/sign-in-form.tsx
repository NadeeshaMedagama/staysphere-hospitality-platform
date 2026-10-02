'use client';

import { useActionState, useId } from 'react';
import { useFormStatus } from 'react-dom';
import type { SignInState } from '@staysphere/app-core';
import { signInAction } from './actions';

const INITIAL: SignInState = {};

const FIELD_CLASS =
  'border-line-strong bg-canvas focus:border-brand-500 mt-1.5 w-full rounded-control border px-3 py-2.5 text-sm outline-none';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-brand-600 hover:bg-brand-700 rounded-control w-full px-4 py-2.5 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Signing in…' : 'Sign in'}
    </button>
  );
}

/**
 * Submits to a server action rather than calling the gateway from the browser,
 * which is what keeps the tokens out of client-side JavaScript: they are set as
 * an httpOnly cookie on the action's response and the browser never sees them.
 */
export function SignInForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState(signInAction, INITIAL);
  const ids = useId();
  const emailId = `${ids}-email`;
  const passwordId = `${ids}-password`;

  return (
    <form action={formAction} noValidate className="space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {state.error ? (
        <p
          role="alert"
          className="rounded-control border-negative/30 bg-negative-soft text-negative border px-3 py-2.5 text-sm"
        >
          {state.error}
        </p>
      ) : null}

      <div>
        <label htmlFor={emailId} className="text-ink-900 block text-sm font-medium">
          Work email
        </label>
        <input
          id={emailId}
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
          defaultValue={state.email}
          aria-invalid={state.fieldErrors?.email ? true : undefined}
          aria-describedby={state.fieldErrors?.email ? `${emailId}-error` : undefined}
          className={FIELD_CLASS}
        />
        {state.fieldErrors?.email ? (
          <p id={`${emailId}-error`} className="text-negative mt-1.5 text-sm">
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
          className={FIELD_CLASS}
        />
        {state.fieldErrors?.password ? (
          <p id={`${passwordId}-error`} className="text-negative mt-1.5 text-sm">
            {state.fieldErrors.password}
          </p>
        ) : null}
      </div>

      <SubmitButton />
    </form>
  );
}
