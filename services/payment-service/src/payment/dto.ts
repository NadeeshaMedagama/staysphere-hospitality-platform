import { PaymentMethod, PaymentProvider, RefundReason } from '@staysphere/contracts';
import { z } from 'zod';

export const createPaymentSchema = z.object({
  bookingId: z.string().min(1),
  hotelId: z.string().min(1),
  stayId: z.string().optional(),
  amountMinor: z.number().int().positive(),
  currency: z.string().trim().toUpperCase().length(3),
  provider: z.nativeEnum(PaymentProvider),
  method: z.nativeEnum(PaymentMethod).default(PaymentMethod.CARD),
  /** Opaque provider token from the client SDK. A raw PAN is never accepted. */
  paymentToken: z.string().max(512).optional(),
  /** False authorises a hold now and captures at check-in. */
  captureImmediately: z.boolean().default(true),
  description: z.string().trim().max(200).default('StaySphere reservation'),
});
export type CreatePaymentDto = z.infer<typeof createPaymentSchema>;

export const capturePaymentSchema = z.object({
  amountMinor: z.number().int().positive().optional(),
});
export type CapturePaymentDto = z.infer<typeof capturePaymentSchema>;

export const refundPaymentSchema = z.object({
  amountMinor: z.number().int().positive(),
  reason: z.nativeEnum(RefundReason),
  notes: z.string().trim().max(500).optional(),
});
export type RefundPaymentDto = z.infer<typeof refundPaymentSchema>;

export const listPaymentsQuerySchema = z.object({
  bookingId: z.string().optional(),
  hotelId: z.string().optional(),
  customerId: z.string().optional(),
  status: z
    .enum(['PENDING', 'AUTHORIZED', 'COMPLETED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListPaymentsQuery = z.infer<typeof listPaymentsQuerySchema>;
