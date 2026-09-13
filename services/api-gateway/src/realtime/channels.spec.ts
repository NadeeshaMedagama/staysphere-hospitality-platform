import { ErrorCode, Role } from '@staysphere/contracts';
import type { Principal } from '@staysphere/service-core';
import {
  ChannelKind,
  assertCanSubscribe,
  canSubscribe,
  channelsForEvent,
  hotelChannel,
  parseChannel,
  userChannel,
} from './channels';

const principal = (overrides: Partial<Principal> = {}): Principal => ({
  id: 'usr_1',
  email: 'staff@example.com',
  roles: [Role.RECEPTIONIST],
  hotelId: 'htl_1',
  sessionId: 'ses_1',
  ...overrides,
});

describe('channel naming', () => {
  it('scopes every property channel to its hotel', () => {
    expect(hotelChannel('htl_1', ChannelKind.ROOMS)).toBe('hotel:htl_1:rooms');
    expect(userChannel('usr_1')).toBe('user:usr_1:notifications');
  });

  it('round-trips through the parser', () => {
    expect(parseChannel(hotelChannel('htl_1', ChannelKind.HOUSEKEEPING))).toEqual({
      kind: ChannelKind.HOUSEKEEPING,
      hotelId: 'htl_1',
      userId: null,
    });
    expect(parseChannel(userChannel('usr_9'))).toEqual({
      kind: ChannelKind.NOTIFICATIONS,
      hotelId: null,
      userId: 'usr_9',
    });
  });

  it('rejects a malformed or unknown channel', () => {
    for (const channel of ['rooms', 'hotel:htl_1:everything', 'hotel::rooms', '../../etc']) {
      expect({ channel, parsed: parseChannel(channel) }).toEqual({ channel, parsed: null });
    }
  });
});

describe('canSubscribe', () => {
  it('lets a receptionist watch their own property', () => {
    expect(canSubscribe(principal(), 'hotel:htl_1:rooms').allowed).toBe(true);
    expect(canSubscribe(principal(), 'hotel:htl_1:reception').allowed).toBe(true);
  });

  it('refuses another property’s stream', () => {
    // Without the scope check, one receptionist sees every property's board.
    expect(canSubscribe(principal(), 'hotel:htl_2:rooms')).toEqual({
      allowed: false,
      denial: 'NOT_YOUR_PROPERTY',
    });
  });

  it('lets a platform administrator watch any property', () => {
    const admin = principal({ roles: [Role.SUPER_ADMIN], hotelId: undefined });
    expect(canSubscribe(admin, 'hotel:htl_9:rooms').allowed).toBe(true);
  });

  it('keeps a guest off every property channel', () => {
    const guest = principal({ roles: [Role.CUSTOMER], hotelId: undefined });
    expect(canSubscribe(guest, 'hotel:htl_1:rooms').denial).toBe('NOT_YOUR_PROPERTY');
  });

  it('enforces the permission behind each channel', () => {
    const receptionist = principal({ roles: [Role.RECEPTIONIST] });
    // Reception can see rooms but does not manage the cleaning queue.
    expect(canSubscribe(receptionist, 'hotel:htl_1:rooms').allowed).toBe(true);
    expect(canSubscribe(receptionist, 'hotel:htl_1:housekeeping').denial).toBe(
      'INSUFFICIENT_PERMISSION',
    );

    const housekeeper = principal({ roles: [Role.HOUSEKEEPING] });
    expect(canSubscribe(housekeeper, 'hotel:htl_1:housekeeping').allowed).toBe(true);
    expect(canSubscribe(housekeeper, 'hotel:htl_1:reception').denial).toBe(
      'INSUFFICIENT_PERMISSION',
    );
  });

  it('confines a personal notification channel to its owner', () => {
    const guest = principal({ roles: [Role.CUSTOMER], hotelId: undefined });
    expect(canSubscribe(guest, 'user:usr_1:notifications').allowed).toBe(true);
    expect(canSubscribe(guest, 'user:usr_2:notifications')).toEqual({
      allowed: false,
      denial: 'NOT_YOUR_CHANNEL',
    });
  });

  it('does not let a platform administrator read someone else’s notifications', () => {
    const admin = principal({ id: 'usr_admin', roles: [Role.SUPER_ADMIN], hotelId: undefined });
    expect(canSubscribe(admin, 'user:usr_1:notifications').denial).toBe('NOT_YOUR_CHANNEL');
  });

  it('rejects an unknown channel', () => {
    expect(canSubscribe(principal(), 'hotel:htl_1:everything').denial).toBe('UNKNOWN_CHANNEL');
  });
});

describe('assertCanSubscribe', () => {
  it('is silent when the subscription is permitted', () => {
    expect(() => assertCanSubscribe(principal(), 'hotel:htl_1:rooms')).not.toThrow();
  });

  it('throws FORBIDDEN for a real channel the principal may not join', () => {
    expect(() => assertCanSubscribe(principal(), 'hotel:htl_2:rooms')).toThrow(
      expect.objectContaining({ code: ErrorCode.FORBIDDEN }),
    );
  });

  it('throws NOT_FOUND for a channel that does not exist', () => {
    expect(() => assertCanSubscribe(principal(), 'nonsense')).toThrow(
      expect.objectContaining({ code: ErrorCode.NOT_FOUND }),
    );
  });
});

describe('channelsForEvent', () => {
  it('fans a check-out out to every audience that needs it', () => {
    // One event; the board, the desk and the cleaning queue all update.
    expect(channelsForEvent('stay.guest-checked-out', 'htl_1').sort()).toEqual(
      ['hotel:htl_1:housekeeping', 'hotel:htl_1:reception', 'hotel:htl_1:rooms'].sort(),
    );
  });

  it('sends a room status change to the board and the desk', () => {
    expect(channelsForEvent('inventory.room-status-changed', 'htl_1').sort()).toEqual(
      ['hotel:htl_1:reception', 'hotel:htl_1:rooms'].sort(),
    );
  });

  it('routes maintenance to engineering and the board', () => {
    expect(channelsForEvent('maintenance.ticket-created', 'htl_1')).toContain(
      'hotel:htl_1:maintenance',
    );
  });

  it('returns nothing for an event with no live audience', () => {
    expect(channelsForEvent('finance.invoice-issued', 'htl_1')).toEqual([]);
    expect(channelsForEvent('unknown.event', 'htl_1')).toEqual([]);
  });

  it('never duplicates a channel', () => {
    const channels = channelsForEvent('stay.guest-checked-out', 'htl_1');
    expect(new Set(channels).size).toBe(channels.length);
  });

  it('always scopes to the hotel it was given', () => {
    for (const channel of channelsForEvent('stay.guest-checked-out', 'htl_7')) {
      expect(channel.startsWith('hotel:htl_7:')).toBe(true);
    }
  });
});
