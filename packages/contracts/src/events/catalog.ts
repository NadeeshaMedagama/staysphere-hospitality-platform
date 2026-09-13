import { z } from 'zod';
import { Topic } from './topics.js';
import { BookingStatus, PaymentStatus } from '../domain/booking.js';
import { RoomStatus } from '../domain/room.js';

const moneySchema = z.object({
  amountMinor: z.number().int(),
  currency: z.string().length(3),
});

const dateRangeSchema = z.object({
  checkIn: z.string().datetime(),
  checkOut: z.string().datetime(),
});

/* -------------------------------------------------------------------------- */
/*  Payload schemas                                                            */
/* -------------------------------------------------------------------------- */

export const userRegisteredPayload = z.object({
  userId: z.string(),
  email: z.string().email(),
  fullName: z.string(),
  roles: z.array(z.string()),
  verificationRequired: z.boolean(),
});

export const bookingCreatedPayload = z.object({
  bookingId: z.string(),
  reference: z.string(),
  hotelId: z.string(),
  customerId: z.string(),
  roomTypeId: z.string(),
  roomId: z.string().nullable(),
  ...dateRangeSchema.shape,
  nights: z.number().int().positive(),
  adults: z.number().int().min(1),
  children: z.number().int().min(0),
  total: moneySchema,
  status: z.literal(BookingStatus.PENDING),
});

export const bookingConfirmedPayload = z.object({
  bookingId: z.string(),
  reference: z.string(),
  hotelId: z.string(),
  customerId: z.string(),
  roomId: z.string(),
  ...dateRangeSchema.shape,
  total: moneySchema,
  paymentId: z.string(),
});

export const bookingCancelledPayload = z.object({
  bookingId: z.string(),
  reference: z.string(),
  hotelId: z.string(),
  customerId: z.string(),
  cancelledBy: z.string(),
  reason: z.string().max(500).optional(),
  refundDue: moneySchema,
  previousStatus: z.nativeEnum(BookingStatus),
});

export const paymentCompletedPayload = z.object({
  paymentId: z.string(),
  bookingId: z.string(),
  customerId: z.string(),
  amount: moneySchema,
  provider: z.enum(['STRIPE', 'PAYHERE', 'PAYPAL', 'CASH', 'BANK_TRANSFER']),
  providerReference: z.string(),
  status: z.nativeEnum(PaymentStatus),
});

export const paymentFailedPayload = z.object({
  paymentId: z.string(),
  bookingId: z.string(),
  amount: moneySchema,
  failureCode: z.string(),
  failureMessage: z.string(),
  retriable: z.boolean(),
});

export const guestCheckedInPayload = z.object({
  stayId: z.string(),
  bookingId: z.string(),
  hotelId: z.string(),
  roomId: z.string(),
  roomNumber: z.string(),
  checkedInAt: z.string().datetime(),
  checkedInBy: z.string(),
});

export const guestCheckedOutPayload = z.object({
  stayId: z.string(),
  bookingId: z.string(),
  hotelId: z.string(),
  roomId: z.string(),
  roomNumber: z.string(),
  checkedOutAt: z.string().datetime(),
  invoiceId: z.string(),
  balanceDue: moneySchema,
});

export const roomStatusChangedPayload = z.object({
  roomId: z.string(),
  hotelId: z.string(),
  roomNumber: z.string(),
  previousStatus: z.nativeEnum(RoomStatus),
  status: z.nativeEnum(RoomStatus),
  changedBy: z.string(),
  reason: z.string().optional(),
});

export const housekeepingTaskCreatedPayload = z.object({
  taskId: z.string(),
  hotelId: z.string(),
  roomId: z.string(),
  roomNumber: z.string(),
  taskType: z.enum(['CHECKOUT_CLEAN', 'STAYOVER_CLEAN', 'DEEP_CLEAN', 'INSPECTION']),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  dueAt: z.string().datetime().nullable(),
});

export const maintenanceTicketCreatedPayload = z.object({
  ticketId: z.string(),
  hotelId: z.string(),
  roomId: z.string().nullable(),
  category: z.string(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  summary: z.string(),
  reportedBy: z.string(),
});

export const hotelPublishedPayload = z.object({
  hotelId: z.string(),
  name: z.string(),
  slug: z.string(),
  city: z.string(),
  countryCode: z.string().length(2),
  amenities: z.array(z.string()),
  status: z.string(),
});

export const roomUpsertedPayload = z.object({
  roomId: z.string(),
  hotelId: z.string(),
  roomNumber: z.string(),
  roomTypeId: z.string(),
  floor: z.number().int(),
  status: z.nativeEnum(RoomStatus),
  maxOccupancy: z.number().int().positive(),
});

export const ratePlanPublishedPayload = z.object({
  ratePlanId: z.string(),
  hotelId: z.string(),
  roomTypeId: z.string(),
  currency: z.string().length(3),
  baseRateMinor: z.number().int().nonnegative(),
  weekendMultiplier: z.number(),
  taxBasisPoints: z.number().int().nonnegative(),
  effectiveFrom: z.string().datetime(),
});

export const paymentInitiatedPayload = z.object({
  paymentId: z.string(),
  bookingId: z.string(),
  customerId: z.string(),
  amount: moneySchema,
  provider: z.enum(['STRIPE', 'PAYHERE', 'PAYPAL', 'CASH', 'BANK_TRANSFER']),
  idempotencyKey: z.string(),
});

export const paymentRefundedPayload = z.object({
  refundId: z.string(),
  paymentId: z.string(),
  bookingId: z.string(),
  amount: moneySchema,
  reason: z.string(),
  partial: z.boolean(),
});

export const serviceRequestedPayload = z.object({
  requestId: z.string(),
  stayId: z.string(),
  hotelId: z.string(),
  roomId: z.string(),
  serviceCode: z.string(),
  quantity: z.number().int().positive(),
  unitPrice: moneySchema,
  requestedBy: z.string(),
  scheduledFor: z.string().datetime().nullable(),
});

export const invoiceIssuedPayload = z.object({
  invoiceId: z.string(),
  invoiceNumber: z.string(),
  stayId: z.string(),
  bookingId: z.string(),
  hotelId: z.string(),
  customerId: z.string(),
  subtotal: moneySchema,
  tax: moneySchema,
  total: moneySchema,
  balanceDue: moneySchema,
  issuedAt: z.string().datetime(),
});

export const housekeepingTaskCompletedPayload = z.object({
  taskId: z.string(),
  hotelId: z.string(),
  roomId: z.string(),
  roomNumber: z.string(),
  completedBy: z.string(),
  completedAt: z.string().datetime(),
  durationMinutes: z.number().int().nonnegative(),
  inspectionRequired: z.boolean(),
});

export const maintenanceTicketResolvedPayload = z.object({
  ticketId: z.string(),
  hotelId: z.string(),
  roomId: z.string().nullable(),
  resolvedBy: z.string(),
  resolvedAt: z.string().datetime(),
  resolutionNotes: z.string(),
  roomReturnedToService: z.boolean(),
});

export const reviewPublishedPayload = z.object({
  reviewId: z.string(),
  hotelId: z.string(),
  stayId: z.string(),
  customerId: z.string(),
  overallRating: z.number(),
  scores: z.record(z.string(), z.number()),
  hasComment: z.boolean(),
});

export const notificationSentPayload = z.object({
  notificationId: z.string(),
  recipientId: z.string(),
  channel: z.enum(['EMAIL', 'SMS', 'PUSH', 'IN_APP']),
  template: z.string(),
  status: z.enum(['SENT', 'DELIVERED', 'FAILED', 'SUPPRESSED']),
});

/* -------------------------------------------------------------------------- */
/*  Registry                                                                   */
/* -------------------------------------------------------------------------- */

export const EventType = {
  USER_REGISTERED: 'identity.user-registered',
  BOOKING_CREATED: 'booking.created',
  BOOKING_CONFIRMED: 'booking.confirmed',
  BOOKING_CANCELLED: 'booking.cancelled',
  PAYMENT_COMPLETED: 'payment.completed',
  PAYMENT_FAILED: 'payment.failed',
  GUEST_CHECKED_IN: 'stay.guest-checked-in',
  GUEST_CHECKED_OUT: 'stay.guest-checked-out',
  ROOM_STATUS_CHANGED: 'inventory.room-status-changed',
  HOUSEKEEPING_TASK_CREATED: 'housekeeping.task-created',
  MAINTENANCE_TICKET_CREATED: 'maintenance.ticket-created',
  HOTEL_PUBLISHED: 'hotel.published',
  ROOM_UPSERTED: 'inventory.room-upserted',
  RATE_PLAN_PUBLISHED: 'pricing.rate-plan-published',
  PAYMENT_INITIATED: 'payment.initiated',
  PAYMENT_REFUNDED: 'payment.refunded',
  SERVICE_REQUESTED: 'stay.service-requested',
  INVOICE_ISSUED: 'finance.invoice-issued',
  HOUSEKEEPING_TASK_COMPLETED: 'housekeeping.task-completed',
  MAINTENANCE_TICKET_RESOLVED: 'maintenance.ticket-resolved',
  REVIEW_PUBLISHED: 'review.published',
  NOTIFICATION_SENT: 'notification.sent',
} as const;

export type EventType = (typeof EventType)[keyof typeof EventType];

export interface EventDefinition<TSchema extends z.ZodTypeAny = z.ZodTypeAny> {
  readonly type: EventType;
  readonly version: number;
  readonly topic: Topic;
  readonly schema: TSchema;
  readonly description: string;
}

/**
 * Single source of truth binding an event type to its topic, version and payload
 * schema. Producers and consumers both resolve through this registry, which is
 * what stops a publisher and a subscriber from silently disagreeing.
 */
export const EVENT_CATALOG = {
  [EventType.USER_REGISTERED]: {
    type: EventType.USER_REGISTERED,
    version: 1,
    topic: Topic.IDENTITY,
    schema: userRegisteredPayload,
    description: 'A new account was created and needs a welcome/verification email.',
  },
  [EventType.BOOKING_CREATED]: {
    type: EventType.BOOKING_CREATED,
    version: 1,
    topic: Topic.BOOKING,
    schema: bookingCreatedPayload,
    description: 'A reservation was placed and is holding inventory pending payment.',
  },
  [EventType.BOOKING_CONFIRMED]: {
    type: EventType.BOOKING_CONFIRMED,
    version: 1,
    topic: Topic.BOOKING,
    schema: bookingConfirmedPayload,
    description: 'Payment settled and the reservation is guaranteed.',
  },
  [EventType.BOOKING_CANCELLED]: {
    type: EventType.BOOKING_CANCELLED,
    version: 1,
    topic: Topic.BOOKING,
    schema: bookingCancelledPayload,
    description: 'A reservation was cancelled; inventory is released and refunds evaluated.',
  },
  [EventType.PAYMENT_COMPLETED]: {
    type: EventType.PAYMENT_COMPLETED,
    version: 1,
    topic: Topic.PAYMENT,
    schema: paymentCompletedPayload,
    description: 'Funds captured for a booking.',
  },
  [EventType.PAYMENT_FAILED]: {
    type: EventType.PAYMENT_FAILED,
    version: 1,
    topic: Topic.PAYMENT,
    schema: paymentFailedPayload,
    description: 'Capture failed; the booking saga must compensate.',
  },
  [EventType.GUEST_CHECKED_IN]: {
    type: EventType.GUEST_CHECKED_IN,
    version: 1,
    topic: Topic.STAY,
    schema: guestCheckedInPayload,
    description: 'A guest took occupancy of a room.',
  },
  [EventType.GUEST_CHECKED_OUT]: {
    type: EventType.GUEST_CHECKED_OUT,
    version: 1,
    topic: Topic.STAY,
    schema: guestCheckedOutPayload,
    description: 'A stay closed; triggers housekeeping and final invoicing.',
  },
  [EventType.ROOM_STATUS_CHANGED]: {
    type: EventType.ROOM_STATUS_CHANGED,
    version: 1,
    topic: Topic.INVENTORY,
    schema: roomStatusChangedPayload,
    description: 'Operational state of a room changed; drives the live floor board.',
  },
  [EventType.HOUSEKEEPING_TASK_CREATED]: {
    type: EventType.HOUSEKEEPING_TASK_CREATED,
    version: 1,
    topic: Topic.HOUSEKEEPING,
    schema: housekeepingTaskCreatedPayload,
    description: 'A cleaning task was queued for a room.',
  },
  [EventType.MAINTENANCE_TICKET_CREATED]: {
    type: EventType.MAINTENANCE_TICKET_CREATED,
    version: 1,
    topic: Topic.MAINTENANCE,
    schema: maintenanceTicketCreatedPayload,
    description: 'An engineering issue was raised against a room or asset.',
  },
  [EventType.HOTEL_PUBLISHED]: {
    type: EventType.HOTEL_PUBLISHED,
    version: 1,
    topic: Topic.HOTEL,
    schema: hotelPublishedPayload,
    description: 'A property became bookable; search and booking projections update.',
  },
  [EventType.ROOM_UPSERTED]: {
    type: EventType.ROOM_UPSERTED,
    version: 1,
    topic: Topic.INVENTORY,
    schema: roomUpsertedPayload,
    description: 'A room was created or its definition changed.',
  },
  [EventType.RATE_PLAN_PUBLISHED]: {
    type: EventType.RATE_PLAN_PUBLISHED,
    version: 1,
    topic: Topic.PRICING,
    schema: ratePlanPublishedPayload,
    description: 'A rate plan became effective; booking re-projects its pricing read model.',
  },
  [EventType.PAYMENT_INITIATED]: {
    type: EventType.PAYMENT_INITIATED,
    version: 1,
    topic: Topic.PAYMENT,
    schema: paymentInitiatedPayload,
    description: 'A payment attempt was created with the provider.',
  },
  [EventType.PAYMENT_REFUNDED]: {
    type: EventType.PAYMENT_REFUNDED,
    version: 1,
    topic: Topic.PAYMENT,
    schema: paymentRefundedPayload,
    description: 'Funds were returned to the guest, in full or in part.',
  },
  [EventType.SERVICE_REQUESTED]: {
    type: EventType.SERVICE_REQUESTED,
    version: 1,
    topic: Topic.STAY,
    schema: serviceRequestedPayload,
    description: 'A guest added a chargeable extra to their stay.',
  },
  [EventType.INVOICE_ISSUED]: {
    type: EventType.INVOICE_ISSUED,
    version: 1,
    topic: Topic.FINANCE,
    schema: invoiceIssuedPayload,
    description: 'A folio was closed into an invoice and sent to the guest.',
  },
  [EventType.HOUSEKEEPING_TASK_COMPLETED]: {
    type: EventType.HOUSEKEEPING_TASK_COMPLETED,
    version: 1,
    topic: Topic.HOUSEKEEPING,
    schema: housekeepingTaskCompletedPayload,
    description: 'A room was cleaned; it returns to sale once inspection passes.',
  },
  [EventType.MAINTENANCE_TICKET_RESOLVED]: {
    type: EventType.MAINTENANCE_TICKET_RESOLVED,
    version: 1,
    topic: Topic.MAINTENANCE,
    schema: maintenanceTicketResolvedPayload,
    description: 'An engineering issue was fixed; the room may return to service.',
  },
  [EventType.REVIEW_PUBLISHED]: {
    type: EventType.REVIEW_PUBLISHED,
    version: 1,
    topic: Topic.REVIEW,
    schema: reviewPublishedPayload,
    description: 'A moderated review went live and affects the property rating.',
  },
  [EventType.NOTIFICATION_SENT]: {
    type: EventType.NOTIFICATION_SENT,
    version: 1,
    topic: Topic.NOTIFICATION,
    schema: notificationSentPayload,
    description: 'A message was dispatched, suppressed or failed.',
  },
} as const satisfies Record<EventType, EventDefinition>;

export type EventPayload<T extends EventType> = z.infer<(typeof EVENT_CATALOG)[T]['schema']>;

export function eventDefinition<T extends EventType>(type: T): (typeof EVENT_CATALOG)[T] {
  return EVENT_CATALOG[type];
}
