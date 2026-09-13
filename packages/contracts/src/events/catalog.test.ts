import { describe, expect, it } from 'vitest';
import { EVENT_CATALOG, EventType, bookingConfirmedPayload } from './catalog.js';
import { buildEvent, eventEnvelopeSchema, parseEvent } from './envelope.js';
import { Topic, deadLetterTopicFor, retryTopicFor } from './topics.js';

const sampleConfirmed = {
  bookingId: 'bkg_01HZX',
  reference: 'SS-10234',
  hotelId: 'htl_001',
  customerId: 'usr_77',
  roomId: 'rm_305',
  checkIn: '2026-10-01T14:00:00.000Z',
  checkOut: '2026-10-04T11:00:00.000Z',
  total: { amountMinor: 54000, currency: 'USD' },
  paymentId: 'pay_9',
};

describe('event catalog', () => {
  it('registers every declared event type', () => {
    for (const type of Object.values(EventType)) {
      expect(EVENT_CATALOG[type], `missing catalog entry for ${type}`).toBeDefined();
      expect(EVENT_CATALOG[type].type).toBe(type);
    }
  });

  it('binds each event to a known topic and a positive version', () => {
    const topics = new Set<string>(Object.values(Topic));
    for (const definition of Object.values(EVENT_CATALOG)) {
      expect(topics.has(definition.topic)).toBe(true);
      expect(definition.version).toBeGreaterThanOrEqual(1);
    }
  });

  it('enforces the dot.delimited.lowercase naming rule', () => {
    for (const type of Object.values(EventType)) {
      expect(type).toMatch(/^[a-z]+(\.[a-z-]+)+$/);
    }
  });
});

describe('event envelope', () => {
  const base = {
    eventId: '01HZXQ8F4M9K2N7P',
    type: EventType.BOOKING_CONFIRMED,
    version: 1,
    source: 'booking-service',
    correlationId: 'req_9f2b71ac',
    occurredAt: new Date('2026-09-08T09:15:00.000Z'),
    payload: sampleConfirmed,
    hotelId: 'htl_001',
  };

  it('builds a schema-valid envelope', () => {
    const event = buildEvent(base);
    expect(() => eventEnvelopeSchema.parse(event)).not.toThrow();
    expect(event.occurredAt).toBe('2026-09-08T09:15:00.000Z');
  });

  it('omits optional fields rather than emitting undefined keys', () => {
    const event = buildEvent(base);
    expect('causationId' in event).toBe(false);
    expect('actor' in event).toBe(false);
  });

  it('round-trips through parseEvent with a typed payload', () => {
    const parsed = parseEvent(buildEvent(base), bookingConfirmedPayload);
    expect(parsed.payload.reference).toBe('SS-10234');
    expect(parsed.payload.total.amountMinor).toBe(54000);
  });

  it('rejects a payload that does not match its schema', () => {
    const broken = buildEvent({ ...base, payload: { ...sampleConfirmed, total: 54000 } });
    expect(() => parseEvent(broken, bookingConfirmedPayload)).toThrow();
  });

  it('rejects a malformed event type', () => {
    const broken = { ...buildEvent(base), type: 'BookingConfirmed' };
    expect(() => eventEnvelopeSchema.parse(broken)).toThrow();
  });
});

describe('topic helpers', () => {
  it('derives deterministic retry and DLQ topics', () => {
    expect(retryTopicFor(Topic.BOOKING, 2)).toBe('staysphere.booking.v1.retry-2');
    expect(deadLetterTopicFor(Topic.BOOKING)).toBe('staysphere.booking.v1.dlq');
  });
});
