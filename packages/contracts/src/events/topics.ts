/**
 * Kafka topics. One topic per aggregate rather than per event type, so ordering
 * is guaranteed for a given aggregate instance when keyed by its id.
 */
export const Topic = {
  IDENTITY: 'staysphere.identity.v1',
  HOTEL: 'staysphere.hotel.v1',
  BOOKING: 'staysphere.booking.v1',
  INVENTORY: 'staysphere.inventory.v1',
  PRICING: 'staysphere.pricing.v1',
  PAYMENT: 'staysphere.payment.v1',
  FINANCE: 'staysphere.finance.v1',
  STAY: 'staysphere.stay.v1',
  HOUSEKEEPING: 'staysphere.housekeeping.v1',
  MAINTENANCE: 'staysphere.maintenance.v1',
  REVIEW: 'staysphere.review.v1',
  NOTIFICATION: 'staysphere.notification.v1',
  AUDIT: 'staysphere.audit.v1',
} as const;

export type Topic = (typeof Topic)[keyof typeof Topic];

/** Dead-letter topic for a given source topic, after retries are exhausted. */
export function deadLetterTopicFor(topic: Topic): string {
  return `${topic}.dlq`;
}

/** Retry topic used by the tiered-backoff consumer strategy. */
export function retryTopicFor(topic: Topic, attempt: 1 | 2 | 3): string {
  return `${topic}.retry-${attempt}`;
}
