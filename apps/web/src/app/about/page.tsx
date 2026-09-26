import type { Metadata } from 'next';
import { PageShell } from '@/components/page-shell';

export const metadata: Metadata = { title: 'About' };

export default function AboutPage() {
  return (
    <PageShell
      eyebrow="Company"
      title="About StaySphere"
      lede="StaySphere is a hotel operations and reservation platform: one system for the guests who book and the teams who deliver the stay."
    >
      <div className="text-ink-700 space-y-4">
        <p>
          Most hotel software treats the booking engine and the back of house as separate products.
          StaySphere does not. A check-out closes the folio, releases the room, raises the
          housekeeping task and updates the floor board — as one chain of events, not four manual
          steps.
        </p>
        <p>
          The platform runs as independent services around a shared event backbone, so the
          reservations path stays fast and available even when reporting or notifications are having
          a bad day.
        </p>
      </div>
    </PageShell>
  );
}
