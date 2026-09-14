import { gatewayFetch, type GatewayResult } from '@staysphere/app-core';
import type { BookingStatus, PaymentStatus, RoomStatus } from '@staysphere/contracts';

/**
 * Typed reads for every console section.
 *
 * Dates cross the wire as ISO strings, never as `Date`, so they are typed that
 * way here and parsed at the point of formatting.
 */

export interface Booking {
  readonly id: string;
  readonly reference: string;
  readonly roomTypeId: string;
  readonly roomId: string | null;
  readonly checkIn: string;
  readonly checkOut: string;
  readonly nights: number;
  readonly adults: number;
  readonly children: number;
  readonly status: BookingStatus;
  readonly paymentStatus: PaymentStatus;
  readonly channel: string;
  readonly currency: string;
  readonly totalMinor: number;
  readonly paidMinor: number;
  readonly guestName: string;
  readonly guestEmail: string;
  readonly createdAt: string;
}

export interface BoardRoomRow {
  readonly id: string;
  readonly number: string;
  readonly status: RoomStatus;
  readonly note: string | null;
  readonly roomType: string;
  readonly sellable: boolean;
}

export interface BoardFloor {
  readonly floor: number;
  readonly rooms: readonly BoardRoomRow[];
}

export interface HousekeepingTask {
  readonly id: string;
  readonly roomNumber: string;
  readonly floor: number;
  readonly type: string;
  readonly status: string;
  readonly priority: string;
  readonly dueAt: string | null;
  /**
   * Authoritative. `assignedToName` is only filled in when the service picks
   * the assignee itself from the shift roster; assigning a named person leaves
   * it null, so a screen that decides "unassigned" from the name alone reports
   * assigned work as nobody's.
   */
  readonly assignedToId: string | null;
  readonly assignedToName: string | null;
  readonly durationMinutes: number | null;
}

export interface MaintenanceTicket {
  readonly id: string;
  readonly roomNumber: string | null;
  readonly location: string | null;
  readonly category: string;
  readonly summary: string;
  readonly status: string;
  readonly priority: string;
  readonly takesRoomOffline: boolean;
  readonly dueAt: string | null;
  readonly assignedToName: string | null;
  readonly costMinor: number;
  /** Null until a cost is actually recorded; `costMinor` defaults to 0. */
  readonly currency: string | null;
}

export interface Payment {
  readonly id: string;
  readonly bookingId: string | null;
  readonly amountMinor: number;
  readonly capturedMinor: number;
  readonly refundedMinor: number;
  readonly currency: string;
  readonly status: PaymentStatus;
  readonly provider: string;
  readonly method: string;
  readonly cardLast4: string | null;
  readonly createdAt: string;
}

export interface Invoice {
  readonly id: string;
  readonly invoiceNumber: string;
  readonly billToName: string;
  readonly billToEmail: string | null;
  readonly status: string;
  readonly currency: string;
  readonly totalMinor: number;
  readonly paidMinor: number;
  readonly refundedMinor: number;
  readonly issuedAt: string | null;
  readonly dueAt: string | null;
}

export interface AuditEntry {
  readonly id: string;
  readonly action: string;
  readonly resource: string;
  /** Null for an action that is not about one particular record. */
  readonly resourceId: string | null;
  readonly actorId: string | null;
  readonly actorEmail: string | null;
  /** The service stores roles as an array, not a single role. */
  readonly actorRoles: readonly string[];
  readonly outcome: string;
  readonly createdAt: string;
}

export interface RoomType {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly maxOccupancy: number;
  readonly maxAdults: number;
  readonly maxChildren: number;
  readonly sizeSquareMetres: number | null;
  readonly active: boolean;
}

export interface DailySummary {
  readonly date: string;
  readonly occupancyPct: number;
  readonly roomsSold: number;
  readonly roomsAvailable: number;
  readonly arrivals: number;
  readonly departures: number;
  readonly cancellations: number;
  readonly revenueMinor: number;
  readonly currency: string;
}

export interface MoneyDto {
  readonly amountMinor: number;
  readonly currency: string;
}

export interface Performance {
  readonly period: { readonly from: string; readonly to: string };
  readonly current: {
    readonly occupancyPct: number;
    readonly adr: MoneyDto;
    readonly revpar: MoneyDto;
    readonly trevpar: MoneyDto;
    readonly roomsSold: number;
    readonly roomsAvailable: number;
    readonly roomRevenue: MoneyDto;
    readonly totalRevenue: MoneyDto;
  };
}

export interface TrendPoint {
  readonly period: string;
  readonly occupancyPct: number;
  readonly adrMinor: number;
  readonly revparMinor: number;
  readonly roomRevenueMinor: number;
  readonly roomsSold: number;
  readonly currency: string;
}

export interface ChannelMix {
  readonly channel: string;
  readonly bookings: number;
  readonly roomNights: number;
  readonly revenueMinor: number;
  readonly currency: string;
}

export interface InHouseStay {
  readonly id: string;
  readonly roomNumber: string | null;
  readonly guestName: string;
  readonly checkInAt: string;
  readonly expectedCheckOut: string;
  readonly balanceMinor: number;
  readonly currency: string;
}

interface Scope {
  readonly hotelId: string;
  readonly accessToken: string;
}

function query(params: Readonly<Record<string, string | number | undefined>>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const rendered = search.toString();
  return rendered ? `?${rendered}` : '';
}

export function listBookings(
  { hotelId, accessToken }: Scope,
  extra: Readonly<Record<string, string | number | undefined>> = {},
): Promise<GatewayResult<Booking[]>> {
  return gatewayFetch<Booking[]>(`/bookings${query({ hotelId, ...extra })}`, { accessToken });
}

export function roomBoard({ hotelId, accessToken }: Scope): Promise<GatewayResult<BoardFloor[]>> {
  return gatewayFetch<BoardFloor[]>(`/rooms/board${query({ hotelId })}`, { accessToken });
}

export function roomTypes({ hotelId, accessToken }: Scope): Promise<GatewayResult<RoomType[]>> {
  return gatewayFetch<RoomType[]>(`/rooms/types${query({ hotelId })}`, { accessToken });
}

export function housekeepingTasks(
  { hotelId, accessToken }: Scope,
  extra: Readonly<Record<string, string | number | undefined>> = {},
): Promise<GatewayResult<HousekeepingTask[]>> {
  return gatewayFetch<HousekeepingTask[]>(`/housekeeping/tasks${query({ hotelId, ...extra })}`, {
    accessToken,
  });
}

export function maintenanceTickets(
  { hotelId, accessToken }: Scope,
  extra: Readonly<Record<string, string | number | undefined>> = {},
): Promise<GatewayResult<MaintenanceTicket[]>> {
  return gatewayFetch<MaintenanceTicket[]>(`/maintenance/tickets${query({ hotelId, ...extra })}`, {
    accessToken,
  });
}

export function payments({ hotelId, accessToken }: Scope): Promise<GatewayResult<Payment[]>> {
  return gatewayFetch<Payment[]>(`/payments${query({ hotelId })}`, { accessToken });
}

export function invoices({ hotelId, accessToken }: Scope): Promise<GatewayResult<Invoice[]>> {
  return gatewayFetch<Invoice[]>(`/invoices${query({ hotelId })}`, { accessToken });
}

export function auditLog({ hotelId, accessToken }: Scope): Promise<GatewayResult<AuditEntry[]>> {
  return gatewayFetch<AuditEntry[]>(`/audit${query({ hotelId, pageSize: 50 })}`, { accessToken });
}

export function dailySummary({
  hotelId,
  accessToken,
}: Scope): Promise<GatewayResult<DailySummary>> {
  return gatewayFetch<DailySummary>(`/reports/today${query({ hotelId })}`, { accessToken });
}

export function performance(
  { hotelId, accessToken }: Scope,
  from: string,
  to: string,
): Promise<GatewayResult<Performance>> {
  return gatewayFetch<Performance>(`/reports/performance${query({ hotelId, from, to })}`, {
    accessToken,
  });
}

export function trend(
  { hotelId, accessToken }: Scope,
  from: string,
  to: string,
): Promise<GatewayResult<TrendPoint[]>> {
  return gatewayFetch<TrendPoint[]>(`/reports/trend${query({ hotelId, from, to })}`, {
    accessToken,
  });
}

export function channelMix(
  { hotelId, accessToken }: Scope,
  from: string,
  to: string,
): Promise<GatewayResult<ChannelMix[]>> {
  return gatewayFetch<ChannelMix[]>(`/reports/channels${query({ hotelId, from, to })}`, {
    accessToken,
  });
}

export function inHouse({ hotelId, accessToken }: Scope): Promise<GatewayResult<InHouseStay[]>> {
  return gatewayFetch<InHouseStay[]>(`/stays/in-house${query({ hotelId })}`, { accessToken });
}

export type { Scope };

export interface Notification {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly channel: string;
  readonly readAt: string | null;
  readonly createdAt: string;
}

export function notifications(accessToken: string): Promise<GatewayResult<Notification[]>> {
  return gatewayFetch<Notification[]>('/notifications?pageSize=50', { accessToken });
}

/**
 * Unread alerts for the header badge.
 *
 * A badge is decoration, not information the shift depends on, so a failure
 * here reports zero rather than taking the whole frame down with it.
 */
export async function unreadCount(accessToken: string): Promise<number> {
  const result = await notifications(accessToken);
  return result.ok ? result.data.filter((item) => !item.readAt).length : 0;
}
