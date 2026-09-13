import type { BookingChannel, BookingStatus, PaymentStatus } from '@staysphere/contracts';
import { gatewayFetch, type GatewayResult } from '@staysphere/app-core';

/**
 * A reservation as the booking service serialises it.
 *
 * Dates arrive as ISO strings over JSON, not as `Date`, so they are typed as
 * strings here and parsed where they are formatted.
 */
export interface Booking {
  readonly id: string;
  readonly reference: string;
  readonly hotelId: string;
  readonly roomTypeId: string;
  readonly checkIn: string;
  readonly checkOut: string;
  readonly nights: number;
  readonly adults: number;
  readonly children: number;
  readonly status: BookingStatus;
  readonly paymentStatus: PaymentStatus;
  readonly channel: BookingChannel;
  readonly currency: string;
  readonly totalMinor: number;
  readonly paidMinor: number;
  readonly guestName: string;
  readonly guestEmail: string;
  readonly createdAt: string;
}

/** Lists the signed-in guest's own reservations; the service scopes them. */
export function listMyBookings(accessToken: string): Promise<GatewayResult<Booking[]>> {
  return gatewayFetch<Booking[]>('/bookings?pageSize=50', { accessToken });
}
