import { ServiceCode } from '@staysphere/contracts';
import { z } from 'zod';

export const checkInSchema = z.object({
  bookingId: z.string().min(1),
  hotelId: z.string().min(1),
  customerId: z.string().min(1),
  roomId: z.string().min(1),
  roomNumber: z.string().min(1).max(10),
  guestNames: z.array(z.string().trim().min(2).max(120)).min(1),
  adults: z.number().int().min(1).max(10).default(1),
  children: z.number().int().min(0).max(10).default(0),
  expectedCheckOut: z.string().datetime(),
  currency: z.string().trim().toUpperCase().length(3),
  depositMinor: z.number().int().min(0).default(0),
  /** Room charges carried over from the reservation. */
  roomChargeMinor: z.number().int().min(0),
  notes: z.string().trim().max(1000).optional(),
});
export type CheckInDto = z.infer<typeof checkInSchema>;

export const checkOutSchema = z.object({
  /** Settles the outstanding balance as part of check-out. */
  settlementMinor: z.number().int().min(0).default(0),
  /** Allows departure with an open balance, e.g. a corporate account. */
  allowUnsettled: z.boolean().default(false),
  notes: z.string().trim().max(1000).optional(),
});
export type CheckOutDto = z.infer<typeof checkOutSchema>;

export const requestServiceSchema = z.object({
  serviceCode: z.nativeEnum(ServiceCode),
  quantity: z.number().int().min(1).max(50).default(1),
  scheduledFor: z.string().datetime().optional(),
  notes: z.string().trim().max(500).optional(),
});
export type RequestServiceDto = z.infer<typeof requestServiceSchema>;

export const postChargeSchema = z.object({
  description: z.string().trim().min(2).max(200),
  quantity: z.number().int().min(1).max(100).default(1),
  unitPriceMinor: z.number().int(),
  kind: z.enum(['SERVICE', 'ADJUSTMENT', 'DISCOUNT']).default('SERVICE'),
});
export type PostChargeDto = z.infer<typeof postChargeSchema>;

export const listStaysQuerySchema = z.object({
  hotelId: z.string().optional(),
  customerId: z.string().optional(),
  status: z.enum(['IN_HOUSE', 'CHECKED_OUT', 'DEPARTED_UNSETTLED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListStaysQuery = z.infer<typeof listStaysQuerySchema>;
