import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { RoomTypeCode, money, type Money } from '@staysphere/contracts';
import { price } from '@/lib/format';

interface RoomDetail {
  readonly code: RoomTypeCode;
  readonly name: string;
  readonly tagline: string;
  readonly description: string;
  readonly sizeSquareMetres: number;
  readonly sleeps: number;
  readonly beds: string;
  readonly bathroom: string;
  readonly view: string;
  readonly nightlyRate: Money;
  readonly rating: number;
  readonly reviewCount: number;
  readonly amenities: readonly string[];
}

/**
 * Shaped like `GET /api/v1/rooms/types` joined with the pricing quote, so
 * swapping the placeholder for live data does not change this component.
 */
const ROOMS: Record<string, RoomDetail> = {
  double: {
    code: RoomTypeCode.DOUBLE,
    name: 'Classic Double',
    tagline: 'Quiet, well-proportioned and looking onto the courtyard.',
    description:
      'A calm room on the lower floors, away from the road. The bed faces the window, and the desk is deep enough to actually work at. Blackout curtains throughout.',
    sizeSquareMetres: 26,
    sleeps: 2,
    beds: 'One queen bed',
    bathroom: 'Walk-in shower',
    view: 'Courtyard',
    nightlyRate: money(8_900, 'USD'),
    rating: 4.5,
    reviewCount: 212,
    amenities: [
      'Free Wi-Fi',
      'Air conditioning',
      'In-room safe',
      'Tea and coffee',
      'Blackout curtains',
    ],
  },
  deluxe: {
    code: RoomTypeCode.DELUXE,
    name: 'Deluxe King',
    tagline: 'Garden-facing, with a balcony and a proper rain shower.',
    description:
      'Our most-booked room. A king bed, a seating chair by the window and a balcony over the garden. The bathroom has a separate walk-in rain shower rather than an over-bath fitting.',
    sizeSquareMetres: 32,
    sleeps: 2,
    beds: 'One king bed',
    bathroom: 'Walk-in rain shower',
    view: 'Garden, from a private balcony',
    nightlyRate: money(12_000, 'USD'),
    rating: 4.8,
    reviewCount: 486,
    amenities: [
      'Free Wi-Fi',
      'Private balcony',
      'Rain shower',
      'Nespresso machine',
      'Minibar',
      'In-room safe',
    ],
  },
  family: {
    code: RoomTypeCode.FAMILY,
    name: 'Family Retreat',
    tagline: 'Two connected bedrooms, a kitchenette and a shaded terrace.',
    description:
      'Built for a family that needs the children asleep while the adults are not. Two bedrooms with a door between them, a kitchenette with a fridge and hob, and a terrace out of the midday sun.',
    sizeSquareMetres: 48,
    sleeps: 5,
    beds: 'One king bed and two singles',
    bathroom: 'Two bathrooms, one with a bath',
    view: 'Garden terrace',
    nightlyRate: money(19_000, 'USD'),
    rating: 4.7,
    reviewCount: 158,
    amenities: ['Free Wi-Fi', 'Kitchenette', 'Two bathrooms', 'Shaded terrace', 'Cot on request'],
  },
  suite: {
    code: RoomTypeCode.SUITE,
    name: 'Ocean Suite',
    tagline: 'A separate living room and an uninterrupted sea view.',
    description:
      'The top floor, facing west. A living room separate from the bedroom, a balcony wide enough to eat on, and nothing between the window and the water.',
    sizeSquareMetres: 62,
    sleeps: 3,
    beds: 'One king bed, sofa bed on request',
    bathroom: 'Bath and separate rain shower',
    view: 'Uninterrupted sea view',
    nightlyRate: money(24_500, 'USD'),
    rating: 4.9,
    reviewCount: 97,
    amenities: [
      'Free Wi-Fi',
      'Sea view',
      'Separate living room',
      'Bathtub',
      'Lounge access',
      'Nespresso machine',
    ],
  },
};

export function generateStaticParams(): Array<{ roomType: string }> {
  return Object.keys(ROOMS).map((roomType) => ({ roomType }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ roomType: string }>;
}): Promise<Metadata> {
  const { roomType } = await params;
  const room = ROOMS[roomType.toLowerCase()];
  if (!room) return { title: 'Room not found' };
  return { title: room.name, description: room.tagline };
}

export default async function RoomDetailPage({
  params,
}: {
  params: Promise<{ roomType: string }>;
}) {
  const { roomType } = await params;
  const room = ROOMS[roomType.toLowerCase()];
  if (!room) notFound();

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <nav aria-label="Breadcrumb" className="text-ink-500 text-sm">
        <Link href="/rooms" className="hover:text-brand-600">
          Rooms &amp; suites
        </Link>
        <span aria-hidden="true" className="mx-2">
          /
        </span>
        <span className="text-ink-700">{room.name}</span>
      </nav>

      {/* Gallery. Real imagery is served from object storage; the placeholder
          keeps the layout honest about the space it will occupy. */}
      <div className="mt-6 grid gap-3 sm:grid-cols-4 sm:grid-rows-2">
        <div
          aria-hidden="true"
          className="rounded-card bg-linear-135 from-brand-400 to-brand-700 h-64 sm:col-span-2 sm:row-span-2 sm:h-full"
        />
        {[0, 1, 2, 3].map((index) => (
          <div
            key={index}
            aria-hidden="true"
            className="rounded-card bg-linear-135 from-brand-100 to-brand-400 hidden h-32 sm:block"
          />
        ))}
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_20rem]">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-ink-900 text-4xl">{room.name}</h1>
            <span className="bg-sand-100 text-ink-700 rounded-md px-2 py-1 text-sm font-medium">
              ★ {room.rating}
            </span>
            <span className="text-ink-500 text-sm">{room.reviewCount} reviews</span>
          </div>
          <p className="text-ink-700 mt-3 text-lg">{room.tagline}</p>
          <p className="text-ink-700 mt-6 leading-relaxed">{room.description}</p>

          <dl className="border-sand-200 mt-8 grid gap-x-8 gap-y-4 border-y py-6 sm:grid-cols-2">
            {[
              ['Size', `${room.sizeSquareMetres} m²`],
              ['Sleeps', `${room.sleeps} guests`],
              ['Beds', room.beds],
              ['Bathroom', room.bathroom],
              ['View', room.view],
            ].map(([term, detail]) => (
              <div key={term}>
                <dt className="text-ink-500 text-xs font-semibold uppercase tracking-widest">
                  {term}
                </dt>
                <dd className="text-ink-900 mt-1">{detail}</dd>
              </div>
            ))}
          </dl>

          <h2 className="font-display text-ink-900 mt-8 text-2xl">In this room</h2>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {room.amenities.map((amenity) => (
              <li key={amenity} className="text-ink-700 flex items-center gap-2 text-sm">
                <span aria-hidden="true" className="text-brand-600">
                  ✓
                </span>
                {amenity}
              </li>
            ))}
          </ul>

          <h2 className="font-display text-ink-900 mt-10 text-2xl">Cancellation</h2>
          <ul className="text-ink-700 mt-4 space-y-2 text-sm">
            <li>Seven or more days before arrival — full refund.</li>
            <li>Between three and seven days — 50% refund.</li>
            <li>Under three days — non-refundable.</li>
          </ul>
        </div>

        {/* Sticky on desktop: the price and the call to action stay in view
            while the guest reads the detail. */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-card border-sand-200 shadow-ink-900/5 border bg-white p-5 shadow-lg">
            <p className="font-display text-ink-900 text-3xl">{price(room.nightlyRate)}</p>
            <p className="text-ink-500 text-sm">per night, including tax</p>

            <dl className="border-sand-200 mt-5 space-y-2 border-t pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-500">Check-in</dt>
                <dd className="text-ink-900">from 14:00</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-500">Check-out</dt>
                <dd className="text-ink-900">by 11:00</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-500">Stays of 7+ nights</dt>
                <dd className="text-brand-600">10% off</dd>
              </div>
            </dl>

            <Link
              href={`/book/${roomType.toLowerCase()}`}
              className="bg-brand-600 hover:bg-brand-700 mt-6 block rounded-lg px-5 py-3 text-center text-sm font-medium text-white transition-colors"
            >
              Reserve now
            </Link>
            <p className="text-ink-500 mt-3 text-center text-xs">
              No booking fee. Your dates are held for 20 minutes.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
