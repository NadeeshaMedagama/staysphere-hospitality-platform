import type { Metadata } from 'next';
import { PageShell } from '@/components/page-shell';

export const metadata: Metadata = { title: 'Contact' };

export default function ContactPage() {
  return (
    <PageShell
      eyebrow="Reservations"
      title="Contact us"
      lede="The front desk is staffed around the clock; reservations answer between 07:00 and 22:00 local time."
    >
      <dl className="grid gap-6 sm:grid-cols-2">
        {[
          ['Reservations', 'reservations@staysphere.example'],
          ['Front desk', '+94 11 000 0000'],
          ['Groups & events', 'events@staysphere.example'],
          ['Press', 'press@staysphere.example'],
        ].map(([term, detail]) => (
          <div key={term} className="rounded-card border-sand-200 border bg-white p-5">
            <dt className="text-ink-500 text-xs font-semibold uppercase tracking-widest">{term}</dt>
            <dd className="text-ink-900 mt-2">{detail}</dd>
          </div>
        ))}
      </dl>
    </PageShell>
  );
}
