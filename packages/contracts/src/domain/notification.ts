export const NotificationChannel = {
  EMAIL: 'EMAIL',
  SMS: 'SMS',
  PUSH: 'PUSH',
  IN_APP: 'IN_APP',
} as const;

export type NotificationChannel = (typeof NotificationChannel)[keyof typeof NotificationChannel];

export const NotificationStatus = {
  QUEUED: 'QUEUED',
  SENDING: 'SENDING',
  SENT: 'SENT',
  DELIVERED: 'DELIVERED',
  FAILED: 'FAILED',
  SUPPRESSED: 'SUPPRESSED',
} as const;

export type NotificationStatus = (typeof NotificationStatus)[keyof typeof NotificationStatus];

export const TemplateKey = {
  WELCOME: 'welcome',
  EMAIL_VERIFICATION: 'email-verification',
  PASSWORD_RESET: 'password-reset',
  BOOKING_CONFIRMED: 'booking-confirmed',
  BOOKING_CANCELLED: 'booking-cancelled',
  PAYMENT_RECEIPT: 'payment-receipt',
  PAYMENT_FAILED: 'payment-failed',
  CHECK_IN_READY: 'check-in-ready',
  CHECK_OUT_INVOICE: 'check-out-invoice',
  ROOM_READY: 'room-ready',
  HOUSEKEEPING_ASSIGNED: 'housekeeping-assigned',
  MAINTENANCE_CREATED: 'maintenance-created',
  MAINTENANCE_RESOLVED: 'maintenance-resolved',
  REVIEW_INVITATION: 'review-invitation',
} as const;

export type TemplateKey = (typeof TemplateKey)[keyof typeof TemplateKey];

/**
 * Notifications a guest may opt out of.
 *
 * Transactional messages are deliberately absent: a booking confirmation or a
 * password reset is not marketing, and suppressing it would break the product.
 */
export const OPTIONAL_TEMPLATES: readonly TemplateKey[] = [TemplateKey.REVIEW_INVITATION];

export function isSuppressible(template: TemplateKey): boolean {
  return OPTIONAL_TEMPLATES.includes(template);
}
