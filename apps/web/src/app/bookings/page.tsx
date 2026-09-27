import type { Metadata } from 'next';
import Link from 'next/link';
import { BookingStatus, formatMoney, money } from '@staysphere/contracts';
import { PageShell } from '@/components/page-shell';
import { listMyBookings, type Booking } from '@/lib/bookings';
import { nightsLabel, stayDates } from '@/lib/format';
import { getSession } from '@/lib/session';

export const metadata: Metadata = { title: 'My bookings' };

// Reservations change as the stay progresses; a cached copy would show a guest
// a status their own check-in has already moved past.
export const dynamic = 'force-dynamic';

const STATUS_STYLES: Readonly<Record<BookingStatus, string>> = {
  [BookingStatus.PENDING]: 'bg-amber-50 text-amber-800 border-amber-200',
  [BookingStatus.CONFIRMED]: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  [BookingStatus.CHECKED_IN]: 'bg-sky-50 text-sky-800 border-sky-200',
  [BookingStatus.CHECKED_OUT]: 'bg-slate-50 text-slate-700 border-slate-200',
  [BookingStatus.CANCELLED]: 'bg-red-50 text-red-800 border-red-200',
  [BookingStatus.NO_SHOW]: 'bg-red-50 text-red-800 border-red-200',
};

const STATUS_LABELS: Readonly<Record<BookingStatus, string>> = {
  [BookingStatus.PENDING]: 'Awaiting payment',
  [BookingStatus.CONFIRMED]: 'Confirmed',
  [BookingStatus.CHECKED_IN]: 'Checked in',
  [BookingStatus.CHECKED_OUT]: 'Completed',
  [BookingStatus.CANCELLED]: 'Cancelled',
  [BookingStatus.NO_SHOW]: 'No show',
};

export default async function BookingsPage() {
  const session = await getSession();

  if (!session) return <SignedOut />;

  const result = await listMyBookings(session.accessToken);

  // An expired or revoked session is not an error to apologise for — it is a
  // prompt to sign in again, which is what the signed-out view already says.
  if (!result.ok && result.status === 401) return <SignedOut expired />;

  if (!result.ok) {
    return (
      <PageShell eyebrow="Your stay" title="Manage a booking">
        <div
          role="alert"
          className="rounded-card border border-amber-200 bg-amber-50 px-6 py-8 text-center"
        >
          <h2 className="text-ink-900 text-lg font-semibold">
            We cannot reach your reservations right now
          </h2>
          <p className="text-ink-700 mx-auto mt-2 max-w-md text-sm">{result.message}</p>
          <p className="text-ink-500 mt-4 text-xs">
            Nothing has changed about your booking — only this page is unavailable. Please try
            again shortly.
          </p>
        </div>
      </PageShell>
    );
  }

  const bookings = result.data;

  return (
    <PageShell
      eyebrow="Your stay"
      title="Manage a booking"
      lede={`Signed in as ${session.user.email}.`}
    >
      {bookings.length === 0 ? (
        <div className="rounded-card border-sand-300 border border-dashed bg-white px-6 py-14 text-center">
          <h2 className="font-display text-ink-900 text-2xl">No bookings yet</h2>
          <p className="text-ink-500 mx-auto mt-3 max-w-md">
            When you reserve a room it appears here with its status, folio and cancellation terms.
          </p>
          <Link
            href="/rooms"
            className="bg-brand-600 hover:bg-brand-700 mt-8 inline-block rounded-lg px-5 py-2.5 text-sm font-medium text-white"
          >
            Browse rooms
          </Link>
        </div>
      ) : (
        <ul className="space-y-4">
          {bookings.map((booking) => (
            <BookingCard key={booking.id} booking={booking} />
          ))}
        </ul>
      )}
    </PageShell>
  );
}

function BookingCard({ booking }: { booking: Booking }) {
  const checkIn = new Date(booking.checkIn);
  const checkOut = new Date(booking.checkOut);
  const guests = booking.adults + booking.children;

  return (
    <li className="rounded-card border-sand-200 border bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-ink-400 font-mono text-xs uppercase tracking-wider">
            {booking.reference}
          </p>
          <h2 className="font-display text-ink-900 mt-1 text-xl">
            {stayDates(checkIn, checkOut)}
          </h2>
          <p className="text-ink-500 mt-1 text-sm">
            {nightsLabel(booking.nights)} · {guests} {guests === 1 ? 'guest' : 'guests'} ·{' '}
            {booking.roomTypeId}
          </p>
        </div>
        <span
          className={`rounded-full border px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[booking.status]}`}
        >
          {STATUS_LABELS[booking.status]}
        </span>
      </div>

      <dl className="border-sand-200 mt-4 flex flex-wrap gap-x-8 gap-y-2 border-t pt-4 text-sm">
        <div>
          <dt className="text-ink-400 text-xs uppercase tracking-wider">Total</dt>
          <dd className="text-ink-900 mt-0.5 font-medium tabular-nums">
            {formatMoney(money(booking.totalMinor, booking.currency))}
          </dd>
        </div>
        <div>
          <dt className="text-ink-400 text-xs uppercase tracking-wider">Paid</dt>
          <dd className="text-ink-700 mt-0.5 tabular-nums">
            {formatMoney(money(booking.paidMinor, booking.currency))}
          </dd>
        </div>
        <div>
          <dt className="text-ink-400 text-xs uppercase tracking-wider">Lead guest</dt>
          <dd className="text-ink-700 mt-0.5">{booking.guestName}</dd>
        </div>
      </dl>
    </li>
  );
}

function SignedOut({ expired = false }: { expired?: boolean }) {
  return (
    <PageShell
      eyebrow="Your stay"
      title="Manage a booking"
      lede="Sign in to view, change or cancel a reservation."
    >
      <div className="rounded-card border-sand-300 border border-dashed bg-white px-6 py-14 text-center">
        <h2 className="font-display text-ink-900 text-2xl">
          {expired ? 'Your session has ended' : 'Sign in to see your bookings'}
        </h2>
        <p className="text-ink-500 mx-auto mt-3 max-w-md">
          {expired
            ? 'For your security we sign you out after a period of inactivity. Sign in again to pick up where you left off.'
            : 'Every reservation on your account appears here with its status, folio and cancellation terms.'}
        </p>
        <Link
          href="/sign-in?next=/bookings"
          className="bg-brand-600 hover:bg-brand-700 mt-8 inline-block rounded-lg px-5 py-2.5 text-sm font-medium text-white"
        >
          Sign in to continue
        </Link>
      </div>
    </PageShell>
  );
}
