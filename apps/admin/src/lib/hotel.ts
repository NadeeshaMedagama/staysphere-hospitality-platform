import { cache } from 'react';
import { gatewayFetch, type Session } from '@staysphere/app-core';

export interface Hotel {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly city: string;
  readonly countryCode: string;
  readonly currency: string;
  readonly timezone: string;
  readonly starRating: number | null;
  readonly status: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly addressLine1: string | null;
  readonly policy: Readonly<Record<string, unknown>> | null;
}

/**
 * The properties this deployment serves.
 *
 * Read from the public listing without a token so the response can be shared:
 * a hotel's name, timezone and policy are the same for everyone, and every
 * screen needs them. Fetching them per request, per page and per user — as an
 * authenticated read would have to — put one avoidable upstream call in front
 * of every panel in the console, and made a slow hotel service look like a
 * total outage on screens whose own data had loaded perfectly well.
 */
const listHotels = cache(async function listHotels(): Promise<readonly Hotel[]> {
  const result = await gatewayFetch<Hotel[]>('/hotels', { revalidate: 300 });
  return result.ok ? result.data : [];
});

/**
 * The property the app is operating on.
 *
 * Staff accounts are scoped to one hotel and use that. Platform accounts
 * (`hotelId: null`, i.e. SUPER_ADMIN) are not scoped to anything, so the first
 * property is used until a property switcher exists — every downstream endpoint
 * requires a `hotelId`, and sending none means every screen fails validation
 * instead of showing data.
 */
export const resolveHotel = cache(async function resolveHotel(
  session: Session,
): Promise<Hotel | null> {
  const hotels = await listHotels();
  const scopedId = session.user.hotelId;

  if (!scopedId) return hotels[0] ?? null;

  const match = hotels.find((hotel) => hotel.id === scopedId);
  if (match) return match;

  // The listing only carries properties that are publicly visible. A member of
  // staff can be attached to one that is not yet published, so fall back to the
  // authenticated read for exactly that case rather than showing them nothing.
  const scoped = await gatewayFetch<Hotel>(`/hotels/${scopedId}`, {
    accessToken: session.accessToken,
  });
  return scoped.ok ? scoped.data : null;
});

/**
 * Today's date in the property's own timezone, as `YYYY-MM-DD`.
 *
 * The server may be in any region; an arrivals list built from the server's
 * midnight would roll over at the wrong moment for the front desk actually
 * working the shift.
 */
export function todayAt(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** `YYYY-MM-DD` a whole number of days before today in the property's timezone. */
export function daysBefore(timezone: string, days: number): string {
  const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
