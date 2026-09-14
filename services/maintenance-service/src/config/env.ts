import { baseEnvSchema, databaseEnvSchema, validateEnv } from '@staysphere/service-core';
import { z } from 'zod';

export const maintenanceEnvSchema = baseEnvSchema.merge(databaseEnvSchema).extend({
  SERVICE_NAME: z.string().default('maintenance-service'),
  PORT: z.coerce.number().int().default(3010),

  /** Verifies access tokens minted by auth-service. */
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().default('staysphere.auth'),
  JWT_AUDIENCE: z.string().default('staysphere.api'),
});

export type MaintenanceEnv = z.infer<typeof maintenanceEnvSchema>;

export function loadMaintenanceEnv(source: NodeJS.ProcessEnv = process.env): MaintenanceEnv {
  return validateEnv(maintenanceEnvSchema, source);
}
