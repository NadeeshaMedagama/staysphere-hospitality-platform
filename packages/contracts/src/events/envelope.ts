import { z } from 'zod';

/**
 * Every message on the broker carries this envelope. The envelope is versioned
 * independently of the payload so consumers can evolve without a lock-step
 * deploy, and `eventId` is the idempotency key every consumer must de-duplicate
 * on before applying a side effect.
 */
export const eventEnvelopeSchema = z.object({
  /** ULID/UUID — stable for the lifetime of the event, including redeliveries. */
  eventId: z.string().min(8).max(64),
  /** Fully-qualified event name, e.g. `booking.confirmed`. */
  type: z.string().regex(/^[a-z]+(\.[a-z-]+)+$/, 'Event type must be dot.delimited.lowercase'),
  /** Payload schema version. Bump on any breaking payload change. */
  version: z.number().int().min(1),
  /** Service that produced the event, e.g. `booking-service`. */
  source: z.string().min(1).max(64),
  /** RFC-3339 timestamp of when the fact occurred (not when it was published). */
  occurredAt: z.string().datetime(),
  /** Ties every event in one end-user interaction together across services. */
  correlationId: z.string().min(8).max(64),
  /** The `eventId` (or request id) that directly caused this event. */
  causationId: z.string().min(8).max(64).optional(),
  /** Principal responsible for the change; absent for system-generated events. */
  actor: z
    .object({
      id: z.string(),
      type: z.enum(['USER', 'STAFF', 'SYSTEM', 'WEBHOOK']),
    })
    .optional(),
  /** Multi-tenant partition key; also used as the Kafka message key. */
  hotelId: z.string().optional(),
  payload: z.unknown(),
});

export type EventEnvelope<TPayload = unknown> = Omit<
  z.infer<typeof eventEnvelopeSchema>,
  'payload'
> & { payload: TPayload };

export interface BuildEventInput<TPayload> {
  type: string;
  version: number;
  source: string;
  correlationId: string;
  payload: TPayload;
  occurredAt: Date;
  eventId: string;
  causationId?: string;
  hotelId?: string;
  actor?: EventEnvelope['actor'];
}

/**
 * Builds an envelope. `eventId` and `occurredAt` are caller-supplied rather than
 * generated here so producers stay deterministic and unit-testable.
 */
export function buildEvent<TPayload>(input: BuildEventInput<TPayload>): EventEnvelope<TPayload> {
  return {
    eventId: input.eventId,
    type: input.type,
    version: input.version,
    source: input.source,
    occurredAt: input.occurredAt.toISOString(),
    correlationId: input.correlationId,
    ...(input.causationId ? { causationId: input.causationId } : {}),
    ...(input.hotelId ? { hotelId: input.hotelId } : {}),
    ...(input.actor ? { actor: input.actor } : {}),
    payload: input.payload,
  };
}

/** Parses and validates an inbound message, returning a typed envelope. */
export function parseEvent<TSchema extends z.ZodTypeAny>(
  raw: unknown,
  payloadSchema: TSchema,
): EventEnvelope<z.infer<TSchema>> {
  const envelope = eventEnvelopeSchema.parse(raw);
  const payload = payloadSchema.parse(envelope.payload) as z.infer<TSchema>;
  return { ...envelope, payload };
}
