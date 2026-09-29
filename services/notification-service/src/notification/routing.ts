import { NotificationChannel, type TemplateKey, isSuppressible } from '@staysphere/contracts';

export interface RecipientPreference {
  readonly channel: NotificationChannel;
  /** Null means the preference covers every template on that channel. */
  readonly template: string | null;
  readonly enabled: boolean;
}

export interface RoutingRequest {
  readonly template: TemplateKey;
  readonly preferred: readonly NotificationChannel[];
  readonly preferences: readonly RecipientPreference[];
  readonly hasEmail: boolean;
  readonly hasPhone: boolean;
  readonly hasPushToken: boolean;
}

export interface RoutingDecision {
  readonly channels: readonly NotificationChannel[];
  readonly suppressed: readonly NotificationChannel[];
}

/**
 * Chooses which channels a message goes out on.
 *
 * Two rules matter:
 *
 * 1. **Opt-outs apply only to optional messages.** A guest who unsubscribes from
 *    review invitations must still receive their booking confirmation — that is
 *    the product working, not spam.
 *
 * 2. **A channel with no address is not a channel.** SMS to a guest with no
 *    phone number is a guaranteed failure, so it is dropped before it is queued
 *    rather than retried three times and dead-lettered.
 *
 * In-app is always included: it costs nothing, needs no address, and gives the
 * guest somewhere to find the message when email fails.
 */
export function routeNotification(request: RoutingRequest): RoutingDecision {
  const chosen: NotificationChannel[] = [];
  const suppressed: NotificationChannel[] = [];
  const optional = isSuppressible(request.template);

  const candidates = new Set<NotificationChannel>([
    ...request.preferred,
    NotificationChannel.IN_APP,
  ]);

  for (const channel of candidates) {
    if (!hasAddress(channel, request)) {
      suppressed.push(channel);
      continue;
    }
    if (optional && !isEnabled(channel, request.template, request.preferences)) {
      suppressed.push(channel);
      continue;
    }
    chosen.push(channel);
  }

  return { channels: chosen, suppressed };
}

function hasAddress(channel: NotificationChannel, request: RoutingRequest): boolean {
  switch (channel) {
    case NotificationChannel.EMAIL:
      return request.hasEmail;
    case NotificationChannel.SMS:
      return request.hasPhone;
    case NotificationChannel.PUSH:
      return request.hasPushToken;
    case NotificationChannel.IN_APP:
      return true;
    default:
      return false;
  }
}

/**
 * Resolves an opt-out. A template-specific preference beats a channel-wide one,
 * so "no marketing email, but still send me this" is expressible.
 */
function isEnabled(
  channel: NotificationChannel,
  template: string,
  preferences: readonly RecipientPreference[],
): boolean {
  const specific = preferences.find(
    (pref) => pref.channel === channel && pref.template === template,
  );
  if (specific) return specific.enabled;

  const channelWide = preferences.find(
    (pref) => pref.channel === channel && pref.template === null,
  );
  return channelWide ? channelWide.enabled : true;
}

/** One message per event, recipient and channel, whatever the redelivery count. */
export function dedupeKey(
  eventId: string,
  recipientId: string,
  channel: NotificationChannel,
): string {
  return `${eventId}:${recipientId}:${channel}`;
}
