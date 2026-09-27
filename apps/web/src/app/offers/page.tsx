import type { Metadata } from 'next';
import { PageShell } from '@/components/page-shell';

export const metadata: Metadata = {
  title: 'Offers',
  description: 'Long-stay rates, early-booking discounts and seasonal packages.',
};

const OFFERS = [
  {
    title: 'Seven nights or more',
    detail: '10% off the nightly rate, applied automatically at checkout. No code needed.',
  },
  {
    title: 'Fourteen nights or more',
    detail: '20% off the nightly rate, plus complimentary weekly housekeeping deep clean.',
  },
  {
    title: 'Book direct',
    detail: 'Best-rate guarantee and free cancellation up to seven days before arrival.',
  },
] as const;

export default function OffersPage() {
  return (
    <PageShell
      eyebrow="Rates"
      title="Offers"
      lede="Discounts are applied to the nightly rate before tax, and stack up to a capped maximum."
    >
      <ul className="space-y-4">
        {OFFERS.map((offer) => (
          <li key={offer.title} className="rounded-card border-sand-200 border bg-white p-5">
            <h2 className="font-display text-ink-900 text-xl">{offer.title}</h2>
            <p className="text-ink-500 mt-2 text-sm leading-relaxed">{offer.detail}</p>
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
