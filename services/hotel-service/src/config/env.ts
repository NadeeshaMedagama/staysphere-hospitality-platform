import { baseEnvSchema, databaseEnvSchema, validateEnv } from '@staysphere/service-core';
import { z } from 'zod';

export const hotelEnvSchema = baseEnvSchema.merge(databaseEnvSchema).extend({
  SERVICE_NAME: z.string().default('hotel-service'),
  PORT: z.coerce.number().int().default(3003),

  /** Verifies access tokens minted by auth-service. */
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().default('staysphere.auth'),
  JWT_AUDIENCE: z.string().default('staysphere.api'),
});

export type HotelEnv = z.infer<typeof hotelEnvSchema>;

export function loadHotelEnv(source: NodeJS.ProcessEnv = process.env): HotelEnv {
  return validateEnv(hotelEnvSchema, source);
}
