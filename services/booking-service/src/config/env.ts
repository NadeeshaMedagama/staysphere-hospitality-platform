import { baseEnvSchema, databaseEnvSchema, validateEnv } from '@staysphere/service-core';
import { z } from 'zod';

export const bookingEnvSchema = baseEnvSchema.merge(databaseEnvSchema).extend({
  SERVICE_NAME: z.string().default('booking-service'),
  PORT: z.coerce.number().int().default(3002),

  /** Longest stay a single reservation may cover. */
  MAX_STAY_NIGHTS: z.coerce.number().int().positive().default(90),
  /** How long an unpaid PENDING booking keeps holding a room. */
  BOOKING_HOLD_MINUTES: z.coerce.number().int().positive().default(20),
  DEFAULT_CURRENCY: z.string().length(3).default('USD'),

  /** Verifies access tokens minted by auth-service. */
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().default('staysphere.auth'),
  JWT_AUDIENCE: z.string().default('staysphere.api'),
});

export type BookingEnv = z.infer<typeof bookingEnvSchema>;

export function loadBookingEnv(source: NodeJS.ProcessEnv = process.env): BookingEnv {
  return validateEnv(bookingEnvSchema, source);
}
