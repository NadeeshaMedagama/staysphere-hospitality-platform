import type { Metadata } from 'next';
import Link from 'next/link';
import { RoomTypeCode, money, type Money } from '@staysphere/contracts';
import { nightsLabel, price, stayDates } from '@/lib/format';

export const metadata: Metadata = {
  title: 'Rooms & Suites',
  description: 'Live availability and nightly rates across the StaySphere collection.',
};

interface RoomOffer {
  readonly code: RoomTypeCode;
  readonly name: string;
  readonly blurb: string;
  readonly sleeps: number;
  readonly nightlyRate: Money;
  readonly rating: number;
  readonly roomsLeft: number;
  readonly amenities: readonly string[];
}

/**
 * Placeholder inventory.
 *
 * Wired to `GET /api/v1/bookings/availability` once the gateway URL is
 * configured; the shape below matches that endpoint's response so swapping the
 * source does not change this component.
 */
const OFFERS: readonly RoomOffer[] = [
  {
    code: RoomTypeCode.DOUBLE,
    name: 'Classic Double',
    blurb: 'Courtyard view, 26 m², queen bed and a compact work nook.',
    sleeps: 2,
    nightlyRate: money(8_900, 'USD'),
    rating: 4.5,
    roomsLeft: 6,
    amenities: ['Free Wi-Fi', 'Air conditioning', 'Safe'],
  },
  {
    code: RoomTypeCode.DELUXE,
    name: 'Deluxe King',
    blurb: 'Garden-facing, 32 m², walk-in rain shower and a writing desk.',
    sleeps: 2,
    nightlyRate: money(12_000, 'USD'),
    rating: 4.8,
    roomsLeft: 3,
    amenities: ['Free Wi-Fi', 'Balcony', 'Nespresso', 'Rain shower'],
  },
  {
    code: RoomTypeCode.FAMILY,
    name: 'Family Retreat',
    blurb: 'Two connected bedrooms, a kitchenette and a shaded terrace.',
    sleeps: 5,
    nightlyRate: money(19_000, 'USD'),
    rating: 4.7,
    roomsLeft: 2,
    amenities: ['Kitchenette', 'Two bathrooms', 'Terrace'],
  },
  {
    code: RoomTypeCode.SUITE,
    name: 'Ocean Suite',
    blurb: 'Separate living room, private balcony and an uninterrupted sea view.',
    sleeps: 3,
    nightlyRate: money(24_500, 'USD'),
    rating: 4.9,
    roomsLeft: 1,
    amenities: ['Sea view', 'Living room', 'Bathtub', 'Lounge access'],
  },
];

function parseStay(params: Record<string, string | string[] | undefined>) {
  const read = (key: string): string | undefined => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const checkIn = read('checkIn');
  const checkOut = read('checkOut');
  if (!checkIn || !checkOut) return null;

  const from = new Date(`${checkIn}T00:00:00.000Z`);
  const to = new Date(`${checkOut}T00:00:00.000Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) return null;

  const nights = Math.round((to.getTime() - from.getTime()) / 86_400_000);
  return { from, to, nights, guests: Number(read('guests') ?? 2) };
}

export default async function RoomsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const stay = parseStay(await searchParams);
  const available = stay ? OFFERS.filter((offer) => offer.sleeps >= stay.guests) : OFFERS;

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <header className="border-sand-200 border-b pb-8">
        <h1 className="font-display text-ink-900 text-4xl">Rooms & suites</h1>
        {stay ? (
          <p className="text-ink-700 mt-3">
            {stayDates(stay.from, stay.to)} · {nightsLabel(stay.nights)} · {stay.guests}{' '}
            {stay.guests === 1 ? 'guest' : 'guests'}
          </p>
        ) : (
          <p className="text-ink-500 mt-3">
            Showing all room types. Pick your dates on the homepage for live pricing.
          </p>
        )}
      </header>

      {available.length === 0 ? (
        <EmptyState guests={stay?.guests ?? 0} />
      ) : (
        <ul className="mt-8 space-y-5">
          {available.map((offer) => (
            <li
              key={offer.code}
              className="rounded-card border-sand-200 grid gap-6 border bg-white p-5 sm:grid-cols-[200px_1fr_auto]"
            >
              <div
                aria-hidden
                className="bg-linear-135 from-brand-400 to-brand-700 hidden h-full min-h-36 rounded-lg sm:block"
              />

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="font-display text-ink-900 text-2xl">{offer.name}</h2>
                  <span className="bg-sand-100 text-ink-700 rounded-md px-2 py-1 text-xs font-medium">
                    ★ {offer.rating}
                  </span>
                </div>
                <p className="text-ink-500 mt-2 text-sm leading-relaxed">{offer.blurb}</p>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {offer.amenities.map((amenity) => (
                    <li
                      key={amenity}
                      className="border-sand-200 text-ink-700 rounded-md border px-2 py-1 text-xs"
                    >
                      {amenity}
                    </li>
                  ))}
                </ul>
                {offer.roomsLeft <= 3 ? (
                  <p className="text-accent-500 mt-4 text-sm font-medium">
                    Only {offer.roomsLeft} left for these dates
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col items-start justify-between gap-4 sm:items-end">
                <div className="sm:text-right">
                  <p className="font-display text-ink-900 text-3xl">{price(offer.nightlyRate)}</p>
                  <p className="text-ink-500 text-sm">per night, incl. tax</p>
                  {stay ? (
                    <p className="text-ink-700 mt-1 text-sm">
                      {price(money(offer.nightlyRate.amountMinor * stay.nights, 'USD'))} total
                    </p>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/rooms/${offer.code.toLowerCase()}`}
                    className="border-sand-200 hover:bg-sand-50 text-ink-900 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors"
                  >
                    View room
                  </Link>
                  <Link
                    href={`/book/${offer.code.toLowerCase()}`}
                    className="bg-brand-600 hover:bg-brand-700 rounded-lg px-5 py-2.5 text-sm font-medium text-white transition-colors"
                  >
                    Reserve
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState({ guests }: { guests: number }) {
  return (
    <div className="rounded-card border-sand-300 mt-16 border border-dashed bg-white px-6 py-16 text-center">
      <h2 className="font-display text-ink-900 text-2xl">No rooms fit that party size</h2>
      <p className="text-ink-500 mx-auto mt-3 max-w-md">
        We could not find a room type that sleeps {guests}. Try splitting the party across two
        rooms, or contact the front desk and we will arrange a connecting pair.
      </p>
      <Link
        href="/"
        className="bg-brand-600 hover:bg-brand-700 mt-8 inline-block rounded-lg px-5 py-2.5 text-sm font-medium text-white"
      >
        Change your search
      </Link>
    </div>
  );
}
