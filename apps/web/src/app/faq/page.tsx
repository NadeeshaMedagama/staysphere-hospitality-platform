import type { Metadata } from 'next';
import { PageShell } from '@/components/page-shell';

export const metadata: Metadata = { title: 'FAQ' };

const QUESTIONS = [
  {
    q: 'When can I check in and out?',
    a: 'Check-in from 14:00, check-out by 11:00. Early arrival and late departure are subject to availability and may carry a charge.',
  },
  {
    q: 'How does cancellation work?',
    a: 'Seven or more days before arrival: full refund. Between three and seven days: 50%. Under three days: non-refundable.',
  },
  {
    q: 'Is breakfast included?',
    a: 'Breakfast is charged separately unless your rate plan states otherwise. It can be added during booking or at the front desk.',
  },
  {
    q: 'Do you hold a deposit?',
    a: 'A pre-authorisation covering incidentals is placed on arrival and released within five working days of check-out.',
  },
] as const;

export default function FaqPage() {
  return (
    <PageShell eyebrow="Guests" title="Frequently asked">
      <dl className="space-y-6">
        {QUESTIONS.map((item) => (
          <div key={item.q} className="border-sand-200 border-b pb-6 last:border-0">
            <dt className="text-ink-900 font-medium">{item.q}</dt>
            <dd className="text-ink-500 mt-2 text-sm leading-relaxed">{item.a}</dd>
          </div>
        ))}
      </dl>
    </PageShell>
  );
}
