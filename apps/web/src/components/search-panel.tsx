'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';

function isoDaysFromNow(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * The primary conversion surface. Dates are constrained client-side so an
 * impossible search never reaches the availability endpoint, but the service
 * re-validates them — the browser is never the authority.
 */
export function SearchPanel() {
  const router = useRouter();
  const ids = useId();
  const [checkIn, setCheckIn] = useState(() => isoDaysFromNow(14));
  const [checkOut, setCheckOut] = useState(() => isoDaysFromNow(17));
  const [guests, setGuests] = useState('2');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (checkOut <= checkIn) {
      setError('Check-out must be at least one night after check-in.');
      return;
    }
    setError(null);
    router.push(`/rooms?checkIn=${checkIn}&checkOut=${checkOut}&guests=${guests}`);
  }

  return (
    <form
      onSubmit={handleSubmit}
      // Native constraint validation would block submit before the handler runs,
      // leaving the guest with an unstyled browser tooltip that is inconsistent
      // across browsers and unreliable in the accessibility tree. The `min`
      // attributes stay as date-picker affordances; the message is ours.
      noValidate
      className="rounded-card border-sand-200 shadow-ink-900/5 border bg-white p-4 shadow-lg sm:p-5"
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto]">
        <Field label="Check-in" htmlFor={`${ids}-in`}>
          <input
            id={`${ids}-in`}
            type="date"
            value={checkIn}
            min={isoDaysFromNow(0)}
            onChange={(event) => setCheckIn(event.target.value)}
            className="text-ink-900 w-full bg-transparent text-sm outline-none"
          />
        </Field>

        <Field label="Check-out" htmlFor={`${ids}-out`}>
          <input
            id={`${ids}-out`}
            type="date"
            value={checkOut}
            min={checkIn}
            onChange={(event) => setCheckOut(event.target.value)}
            className="text-ink-900 w-full bg-transparent text-sm outline-none"
          />
        </Field>

        <Field label="Guests" htmlFor={`${ids}-guests`}>
          <select
            id={`${ids}-guests`}
            value={guests}
            onChange={(event) => setGuests(event.target.value)}
            className="text-ink-900 w-full bg-transparent text-sm outline-none sm:w-24"
          >
            {[1, 2, 3, 4, 5, 6].map((count) => (
              <option key={count} value={count}>
                {count} {count === 1 ? 'guest' : 'guests'}
              </option>
            ))}
          </select>
        </Field>

        <button
          type="submit"
          className="bg-brand-600 hover:bg-brand-700 rounded-lg px-6 py-3 text-sm font-medium text-white transition-colors sm:self-stretch"
        >
          Search rooms
        </button>
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-sand-200 bg-sand-50 rounded-lg border px-3 py-2">
      <label
        htmlFor={htmlFor}
        className="text-ink-500 block text-[0.6875rem] font-semibold uppercase tracking-widest"
      >
        {label}
      </label>
      {children}
    </div>
  );
}
