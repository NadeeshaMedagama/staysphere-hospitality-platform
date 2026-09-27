import type { Metadata } from 'next';
import { PageShell } from '@/components/page-shell';

export const metadata: Metadata = { title: 'Amenities' };

const GROUPS = [
  {
    heading: 'Wellness',
    items: ['Infinity pool', 'Spa & hammam', 'Gym, open 24 hours', 'Yoga pavilion'],
  },
  {
    heading: 'Dining',
    items: ['Coastal fine dining', 'All-day brasserie', 'Pool bar', 'In-room dining'],
  },
  {
    heading: 'Practical',
    items: ['Airport transfers', 'Secure parking', 'Laundry & pressing', 'Business centre'],
  },
] as const;

export default function AmenitiesPage() {
  return (
    <PageShell
      eyebrow="The property"
      title="Amenities"
      lede="Everything included in your stay, and what can be arranged on request."
    >
      <div className="grid gap-8 sm:grid-cols-3">
        {GROUPS.map((group) => (
          <div key={group.heading}>
            <h2 className="text-ink-500 text-sm font-semibold uppercase tracking-widest">
              {group.heading}
            </h2>
            <ul className="text-ink-700 mt-3 space-y-2 text-sm">
              {group.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
