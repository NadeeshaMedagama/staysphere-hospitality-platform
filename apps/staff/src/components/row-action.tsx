'use client';

import { useActionState, useId, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@staysphere/ui';
import type { ActionState } from '@/app/actions';

const INITIAL: ActionState = {};

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

function Submit({ label, variant }: { label: string; variant?: 'primary' | 'secondary' }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant={variant} disabled={pending}>
      {pending ? 'Working…' : label}
    </Button>
  );
}

/**
 * A single-button action on a table row.
 *
 * The button is a real form submit rather than an onClick fetch, so the work
 * happens in a server action with the session cookie attached and the list is
 * revalidated on success — no token reaches the browser, and the row reflects
 * what the service actually did rather than what the click assumed.
 */
export function RowAction({
  action,
  id,
  label,
  variant,
}: {
  action: Action;
  id: string;
  label: string;
  variant?: 'primary' | 'secondary';
}) {
  const [state, formAction] = useActionState(action, INITIAL);

  return (
    <form action={formAction} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="id" value={id} />
      <Submit label={label} variant={variant} />
      {state.error ? (
        <span role="alert" className="text-negative max-w-48 text-right text-xs">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

/**
 * An action that needs a sentence before it can be taken.
 *
 * The note is required by the service, so it is collected before the request
 * rather than after a rejection.
 */
export function RowActionWithNote({
  action,
  id,
  label,
  field,
  placeholder,
}: {
  action: Action;
  id: string;
  label: string;
  field: string;
  placeholder: string;
}) {
  const [state, formAction] = useActionState(action, INITIAL);
  const [open, setOpen] = useState(false);
  const inputId = useId();

  if (!open) {
    return (
      <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col items-end gap-1.5">
      <input type="hidden" name="id" value={id} />
      <label htmlFor={inputId} className="sr-only">
        {placeholder}
      </label>
      <input
        id={inputId}
        name={field}
        required
        autoFocus
        placeholder={placeholder}
        className="border-line-strong bg-canvas rounded-control w-48 border px-2 py-1 text-sm outline-none"
      />
      <div className="flex gap-1.5">
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Submit label={label} />
      </div>
      {state.error ? (
        <span role="alert" className="text-negative max-w-48 text-right text-xs">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
