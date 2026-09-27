import type { Metadata } from 'next';
import { PageShell } from '@/components/page-shell';

export const metadata: Metadata = { title: 'Privacy' };

export default function PrivacyPage() {
  return (
    <PageShell
      eyebrow="Legal"
      title="Privacy"
      lede="What we collect when you book, why we hold it, and how long it stays."
    >
      <div className="text-ink-700 space-y-4 text-sm leading-relaxed">
        <p>
          We collect the details needed to hold and deliver a reservation: name, contact details,
          stay dates and payment status. Card details are handled by our payment provider and are
          never stored on StaySphere systems.
        </p>
        <p>
          Reservation records are retained for seven years to meet accounting obligations. Marketing
          consent is separate from booking data and can be withdrawn at any time.
        </p>
        <p>
          To request a copy of your data or its deletion, contact{' '}
          <span className="text-ink-900">privacy@staysphere.example</span>.
        </p>
      </div>
    </PageShell>
  );
}
