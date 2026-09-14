import { BookingChannel } from '@staysphere/contracts';
import { z } from 'zod';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must be formatted as YYYY-MM-DD')
  .transform((value) => new Date(`${value}T00:00:00.000Z`));

export const availabilityQuerySchema = z.object({
  hotelId: z.string().min(1),
  roomTypeId: z.string().min(1),
  checkIn: isoDate,
  checkOut: isoDate,
  adults: z.coerce.number().int().min(1).max(10).default(1),
  children: z.coerce.number().int().min(0).max(10).default(0),
});
export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;

export const createBookingSchema = z.object({
  hotelId: z.string().min(1),
  roomTypeId: z.string().min(1),
  checkIn: isoDate,
  checkOut: isoDate,
  adults: z.number().int().min(1).max(10).default(1),
  children: z.number().int().min(0).max(10).default(0),
  guestName: z.string().trim().min(2).max(120),
  guestEmail: z.string().trim().toLowerCase().email(),
  guestPhone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{7,20}$/)
    .optional(),
  promotionCode: z.string().trim().max(32).optional(),
  channel: z.nativeEnum(BookingChannel).default(BookingChannel.DIRECT_WEB),
  notes: z.string().trim().max(1000).optional(),
});
export type CreateBookingDto = z.infer<typeof createBookingSchema>;

export const cancelBookingSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});
export type CancelBookingDto = z.infer<typeof cancelBookingSchema>;

export const listBookingsQuerySchema = z.object({
  hotelId: z.string().optional(),
  customerId: z.string().optional(),
  status: z
    .enum(['PENDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED', 'NO_SHOW'])
    .optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListBookingsQuery = z.infer<typeof listBookingsQuerySchema>;
