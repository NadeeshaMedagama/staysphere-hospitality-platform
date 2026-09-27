import Link from 'next/link';
import { RoomTypeCode, money } from '@staysphere/contracts';
import { SearchPanel } from '@/components/search-panel';
import { price } from '@/lib/format';

const FEATURED = [
  {
    code: RoomTypeCode.DELUXE,
    name: 'Deluxe King',
    blurb: 'Garden-facing, 32 m², walk-in rain shower and a writing desk.',
    sleeps: 2,
    rate: money(12_000, 'USD'),
    rating: 4.8,
  },
  {
    code: RoomTypeCode.SUITE,
    name: 'Ocean Suite',
    blurb: 'Separate living room, private balcony and an uninterrupted sea view.',
    sleeps: 3,
    rate: money(24_500, 'USD'),
    rating: 4.9,
  },
  {
    code: RoomTypeCode.FAMILY,
    name: 'Family Retreat',
    blurb: 'Two connected bedrooms, a kitchenette and a shaded terrace.',
    sleeps: 5,
    rate: money(19_000, 'USD'),
    rating: 4.7,
  },
] as const;

const AMENITIES = [
  { title: 'Infinity pool', detail: 'Open 06:00 – 21:00, heated year round.' },
  { title: 'Spa & hammam', detail: 'Six treatment rooms and a marble steam suite.' },
  { title: 'Two restaurants', detail: 'Coastal fine dining and an all-day brasserie.' },
  { title: 'Airport transfers', detail: 'Private car, arranged at booking or on request.' },
] as const;

export default function HomePage() {
  return (
    <>
      <section className="border-sand-200 bg-linear-to-b from-brand-50 to-sand-50 relative overflow-hidden border-b">
        <div className="mx-auto max-w-6xl px-4 pb-16 pt-20 sm:px-6 sm:pb-20 sm:pt-28">
          <p className="text-brand-600 text-xs font-semibold uppercase tracking-[0.2em]">
            The StaySphere Collection
          </p>
          <h1 className="font-display text-ink-900 mt-4 max-w-3xl text-4xl leading-[1.1] sm:text-6xl">
            Find your perfect stay.
          </h1>
          <p className="text-ink-700 mt-5 max-w-xl text-base leading-relaxed sm:text-lg">
            Live availability across every property, transparent nightly pricing, and no booking
            fees — ever. Reserve in under a minute.
          </p>

          <div className="mt-10 max-w-4xl">
            <SearchPanel />
          </div>

          <dl className="text-ink-700 mt-10 flex flex-wrap gap-x-10 gap-y-4 text-sm">
            {[
              ['Free cancellation', 'up to 7 days before arrival'],
              ['Best-rate guarantee', 'on every direct booking'],
              ['24/7 concierge', 'from reservation to check-out'],
            ].map(([term, detail]) => (
              <div key={term}>
                <dt className="text-ink-900 font-medium">{term}</dt>
                <dd className="text-ink-500">{detail}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="flex items-end justify-between gap-6">
          <div>
            <h2 className="font-display text-ink-900 text-3xl">Rooms & suites</h2>
            <p className="text-ink-500 mt-2">
              Every room is cleaned, inspected and released the same day.
            </p>
          </div>
          <Link
            href="/rooms"
            className="text-brand-600 hover:text-brand-700 hidden shrink-0 text-sm font-medium sm:block"
          >
            View all rooms →
          </Link>
        </div>

        <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURED.map((room) => (
            <li
              key={room.code}
              className="rounded-card border-sand-200 hover:shadow-ink-900/5 group flex flex-col overflow-hidden border bg-white transition-shadow hover:shadow-lg"
            >
              <div
                aria-hidden
                className="bg-linear-135 from-brand-400 via-brand-500 to-brand-700 h-44"
              />
              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-display text-ink-900 text-xl">{room.name}</h3>
                  <span className="bg-sand-100 text-ink-700 shrink-0 rounded-md px-2 py-1 text-xs font-medium">
                    ★ {room.rating}
                  </span>
                </div>
                <p className="text-ink-500 mt-2 flex-1 text-sm leading-relaxed">{room.blurb}</p>
                <div className="border-sand-200 mt-5 flex items-baseline justify-between border-t pt-4">
                  <p className="text-ink-500 text-sm">Sleeps {room.sleeps}</p>
                  <p className="text-ink-900">
                    <span className="font-display text-2xl">{price(room.rate)}</span>
                    <span className="text-ink-500 text-sm"> / night</span>
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-sand-200 border-y bg-white">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 className="font-display text-ink-900 text-3xl">What is included</h2>
          <ul className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {AMENITIES.map((amenity) => (
              <li key={amenity.title}>
                <h3 className="text-ink-900 text-base font-medium">{amenity.title}</h3>
                <p className="text-ink-500 mt-1.5 text-sm leading-relaxed">{amenity.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="rounded-card bg-brand-700 px-8 py-14 text-center sm:px-16">
          <h2 className="font-display text-3xl text-white sm:text-4xl">Planning a longer stay?</h2>
          <p className="text-brand-100 mx-auto mt-4 max-w-xl">
            Stays of seven nights or more receive an automatic rate reduction, applied at checkout —
            no code required.
          </p>
          <Link
            href="/offers"
            className="bg-accent-400 text-ink-900 hover:bg-accent-500 mt-8 inline-block rounded-lg px-6 py-3 text-sm font-medium transition-colors"
          >
            See long-stay rates
          </Link>
        </div>
      </section>
    </>
  );
}
