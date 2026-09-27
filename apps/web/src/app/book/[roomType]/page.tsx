import type { Metadata } from 'next';
import { PageShell } from '@/components/page-shell';

const STEPS = ['Room', 'Guest details', 'Extras', 'Payment', 'Confirmation'] as const;

export const metadata: Metadata = {
  title: 'Complete your booking',
  robots: { index: false, follow: false },
};

export default async function BookingFlowPage({
  params,
}: {
  params: Promise<{ roomType: string }>;
}) {
  const { roomType } = await params;
  const readable = roomType.replace(/-/g, ' ');

  return (
    <PageShell
      eyebrow="Reservation"
      title="Complete your booking"
      lede={`You are reserving a ${readable} room. Your dates are held for 20 minutes while you finish.`}
    >
      <ol className="flex flex-wrap items-center gap-2 text-sm">
        {STEPS.map((step, index) => (
          <li key={step} className="flex items-center gap-2">
            <span
              className={
                index === 0
                  ? 'bg-brand-600 rounded-md px-3 py-1.5 font-medium text-white'
                  : 'border-sand-200 text-ink-500 rounded-md border px-3 py-1.5'
              }
            >
              {step}
            </span>
            {index < STEPS.length - 1 ? (
              <span aria-hidden className="text-sand-300">
                →
              </span>
            ) : null}
          </li>
        ))}
      </ol>

      <p className="rounded-card border-sand-300 text-ink-500 mt-8 border border-dashed bg-white p-6 text-sm">
        The guest-details step is served by the booking service once the gateway URL is configured
        for this environment. The room hold, quote and idempotency key are already created by
        <code className="bg-sand-100 mx-1 rounded px-1.5 py-0.5 text-xs">
          POST /api/v1/bookings
        </code>
        at this point in the flow.
      </p>
    </PageShell>
  );
}
