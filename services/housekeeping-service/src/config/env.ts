import { baseEnvSchema, databaseEnvSchema, validateEnv } from '@staysphere/service-core';
import { z } from 'zod';

export const housekeepingEnvSchema = baseEnvSchema.merge(databaseEnvSchema).extend({
  SERVICE_NAME: z.string().default('housekeeping-service'),
  PORT: z.coerce.number().int().default(3009),

  /** Verifies access tokens minted by auth-service. */
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().default('staysphere.auth'),
  JWT_AUDIENCE: z.string().default('staysphere.api'),
});

export type HousekeepingEnv = z.infer<typeof housekeepingEnvSchema>;

export function loadHousekeepingEnv(source: NodeJS.ProcessEnv = process.env): HousekeepingEnv {
  return validateEnv(housekeepingEnvSchema, source);
}
