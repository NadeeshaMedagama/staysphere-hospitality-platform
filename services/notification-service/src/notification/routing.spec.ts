import { NotificationChannel, TemplateKey } from '@staysphere/contracts';
import { dedupeKey, routeNotification, type RoutingRequest } from './routing';

const request = (overrides: Partial<RoutingRequest> = {}): RoutingRequest => ({
  template: TemplateKey.BOOKING_CONFIRMED,
  preferred: [NotificationChannel.EMAIL],
  preferences: [],
  hasEmail: true,
  hasPhone: true,
  hasPushToken: true,
  ...overrides,
});

describe('routeNotification', () => {
  it('sends on the preferred channel and always adds in-app', () => {
    const result = routeNotification(request());
    expect(result.channels).toEqual([NotificationChannel.EMAIL, NotificationChannel.IN_APP]);
  });

  it('drops a channel the recipient has no address for', () => {
    // Queuing SMS to a guest with no number is a guaranteed dead letter.
    const result = routeNotification(
      request({ preferred: [NotificationChannel.EMAIL, NotificationChannel.SMS], hasPhone: false }),
    );
    expect(result.channels).not.toContain(NotificationChannel.SMS);
    expect(result.suppressed).toContain(NotificationChannel.SMS);
  });

  it('ignores an opt-out for a transactional message', () => {
    // Unsubscribing from marketing must not stop a booking confirmation.
    const result = routeNotification(
      request({
        template: TemplateKey.BOOKING_CONFIRMED,
        preferences: [{ channel: NotificationChannel.EMAIL, template: null, enabled: false }],
      }),
    );
    expect(result.channels).toContain(NotificationChannel.EMAIL);
  });

  it('honours an opt-out for an optional message', () => {
    const result = routeNotification(
      request({
        template: TemplateKey.REVIEW_INVITATION,
        preferences: [{ channel: NotificationChannel.EMAIL, template: null, enabled: false }],
      }),
    );
    expect(result.channels).not.toContain(NotificationChannel.EMAIL);
    expect(result.suppressed).toContain(NotificationChannel.EMAIL);
  });

  it('lets a template-specific preference override a channel-wide one', () => {
    const result = routeNotification(
      request({
        template: TemplateKey.REVIEW_INVITATION,
        preferences: [
          { channel: NotificationChannel.EMAIL, template: null, enabled: false },
          {
            channel: NotificationChannel.EMAIL,
            template: TemplateKey.REVIEW_INVITATION,
            enabled: true,
          },
        ],
      }),
    );
    expect(result.channels).toContain(NotificationChannel.EMAIL);
  });

  it('always keeps in-app, which needs no address', () => {
    const result = routeNotification(
      request({ hasEmail: false, hasPhone: false, hasPushToken: false }),
    );
    expect(result.channels).toEqual([NotificationChannel.IN_APP]);
  });

  it('does not duplicate a channel that is both preferred and default', () => {
    const result = routeNotification(request({ preferred: [NotificationChannel.IN_APP] }));
    expect(result.channels).toEqual([NotificationChannel.IN_APP]);
  });

  it('fans out across several preferred channels', () => {
    const result = routeNotification(
      request({
        preferred: [NotificationChannel.EMAIL, NotificationChannel.SMS, NotificationChannel.PUSH],
      }),
    );
    expect(result.channels).toHaveLength(4);
  });
});

describe('dedupeKey', () => {
  it('is stable for one event, recipient and channel', () => {
    expect(dedupeKey('evt_1', 'usr_1', NotificationChannel.EMAIL)).toBe('evt_1:usr_1:EMAIL');
  });

  it('differs per channel so a fan-out is not collapsed', () => {
    expect(dedupeKey('evt_1', 'usr_1', NotificationChannel.EMAIL)).not.toBe(
      dedupeKey('evt_1', 'usr_1', NotificationChannel.SMS),
    );
  });
});
