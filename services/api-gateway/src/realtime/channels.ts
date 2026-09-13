import { DomainError, ErrorCode, Permission, Role, hasPermission } from '@staysphere/contracts';
import type { Principal } from '@staysphere/service-core';

/**
 * Real-time channels.
 *
 * Every channel is scoped to a property. A client subscribes to
 * `hotel:<id>:rooms`, never to "all room updates" — without the scope, a
 * receptionist at one property would receive the live floor board of every
 * other property on the platform.
 */
export const ChannelKind = {
  ROOMS: 'rooms',
  BOOKINGS: 'bookings',
  HOUSEKEEPING: 'housekeeping',
  MAINTENANCE: 'maintenance',
  RECEPTION: 'reception',
  NOTIFICATIONS: 'notifications',
} as const;

export type ChannelKind = (typeof ChannelKind)[keyof typeof ChannelKind];

/** Permission required to join each channel. */
const CHANNEL_PERMISSIONS: Record<ChannelKind, Permission> = {
  [ChannelKind.ROOMS]: Permission.ROOM_READ,
  [ChannelKind.BOOKINGS]: Permission.BOOKING_READ,
  [ChannelKind.HOUSEKEEPING]: Permission.HOUSEKEEPING_MANAGE,
  [ChannelKind.MAINTENANCE]: Permission.MAINTENANCE_MANAGE,
  [ChannelKind.RECEPTION]: Permission.BOOKING_WRITE,
  // Personal channels are authorised by identity, not by permission.
  [ChannelKind.NOTIFICATIONS]: Permission.BOOKING_READ,
};

export interface ParsedChannel {
  readonly kind: ChannelKind;
  readonly hotelId: string | null;
  readonly userId: string | null;
}

export function hotelChannel(hotelId: string, kind: ChannelKind): string {
  return `hotel:${hotelId}:${kind}`;
}

export function userChannel(userId: string): string {
  return `user:${userId}:${ChannelKind.NOTIFICATIONS}`;
}

/** Parses a channel name, returning null when it is not a recognised shape. */
export function parseChannel(channel: string): ParsedChannel | null {
  const hotelMatch = /^hotel:([A-Za-z0-9_-]{1,64}):([a-z]+)$/.exec(channel);
  if (hotelMatch) {
    const kind = hotelMatch[2] as ChannelKind;
    if (!Object.values(ChannelKind).includes(kind)) return null;
    return { kind, hotelId: hotelMatch[1] as string, userId: null };
  }

  const userMatch = /^user:([A-Za-z0-9_-]{1,64}):notifications$/.exec(channel);
  if (userMatch) {
    return { kind: ChannelKind.NOTIFICATIONS, hotelId: null, userId: userMatch[1] as string };
  }

  return null;
}

export type SubscriptionDenial =
  'UNKNOWN_CHANNEL' | 'NOT_YOUR_PROPERTY' | 'NOT_YOUR_CHANNEL' | 'INSUFFICIENT_PERMISSION';

export interface SubscriptionDecision {
  readonly allowed: boolean;
  readonly denial?: SubscriptionDenial;
}

/**
 * Decides whether a principal may join a channel.
 *
 * Authorisation happens on subscribe, not on publish. Checking at publish time
 * would mean evaluating permissions once per connected client per event — and
 * getting it wrong once leaks the entire stream rather than a single message.
 */
export function canSubscribe(principal: Principal, channel: string): SubscriptionDecision {
  const parsed = parseChannel(channel);
  if (!parsed) return { allowed: false, denial: 'UNKNOWN_CHANNEL' };

  // A personal notification channel belongs to exactly one account.
  if (parsed.userId !== null) {
    return parsed.userId === principal.id
      ? { allowed: true }
      : { allowed: false, denial: 'NOT_YOUR_CHANNEL' };
  }

  // Staff are scoped to their property; platform admins are not.
  const platformWide = principal.roles.includes(Role.SUPER_ADMIN);
  if (!platformWide && principal.hotelId && parsed.hotelId !== principal.hotelId) {
    return { allowed: false, denial: 'NOT_YOUR_PROPERTY' };
  }
  // A guest has no hotel scope and therefore no business on a property channel.
  if (!platformWide && !principal.hotelId) {
    return { allowed: false, denial: 'NOT_YOUR_PROPERTY' };
  }

  const required = CHANNEL_PERMISSIONS[parsed.kind];
  if (!hasPermission(principal.roles, required)) {
    return { allowed: false, denial: 'INSUFFICIENT_PERMISSION' };
  }

  return { allowed: true };
}

const DENIAL_MESSAGES: Record<SubscriptionDenial, string> = {
  UNKNOWN_CHANNEL: 'That channel does not exist.',
  NOT_YOUR_PROPERTY: 'You may only subscribe to channels for your own property.',
  NOT_YOUR_CHANNEL: 'You may only subscribe to your own notification channel.',
  INSUFFICIENT_PERMISSION: 'Your role does not permit subscribing to this channel.',
};

export function assertCanSubscribe(principal: Principal, channel: string): void {
  const decision = canSubscribe(principal, channel);
  if (!decision.allowed) {
    const denial = decision.denial ?? 'UNKNOWN_CHANNEL';
    throw new DomainError(
      denial === 'UNKNOWN_CHANNEL' ? ErrorCode.NOT_FOUND : ErrorCode.FORBIDDEN,
      DENIAL_MESSAGES[denial],
      { details: { channel, reason: denial } },
    );
  }
}

/**
 * The channels a domain event should be broadcast on.
 *
 * A single check-out reaches the floor board, the reception dashboard and the
 * housekeeping queue — one event, three audiences, and none of them polling.
 */
export function channelsForEvent(eventType: string, hotelId: string): string[] {
  const channels = new Set<string>();
  const add = (kind: ChannelKind) => channels.add(hotelChannel(hotelId, kind));

  switch (eventType) {
    case 'inventory.room-status-changed':
      add(ChannelKind.ROOMS);
      add(ChannelKind.RECEPTION);
      break;
    case 'booking.created':
    case 'booking.confirmed':
    case 'booking.cancelled':
      add(ChannelKind.BOOKINGS);
      add(ChannelKind.RECEPTION);
      break;
    case 'stay.guest-checked-in':
      add(ChannelKind.RECEPTION);
      add(ChannelKind.ROOMS);
      break;
    case 'stay.guest-checked-out':
      add(ChannelKind.RECEPTION);
      add(ChannelKind.ROOMS);
      add(ChannelKind.HOUSEKEEPING);
      break;
    case 'housekeeping.task-created':
    case 'housekeeping.task-completed':
      add(ChannelKind.HOUSEKEEPING);
      add(ChannelKind.ROOMS);
      break;
    case 'maintenance.ticket-created':
    case 'maintenance.ticket-resolved':
      add(ChannelKind.MAINTENANCE);
      add(ChannelKind.ROOMS);
      break;
    default:
      break;
  }

  return [...channels];
}
