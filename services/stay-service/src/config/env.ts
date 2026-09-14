import { baseEnvSchema, databaseEnvSchema, validateEnv } from '@staysphere/service-core';
import { z } from 'zod';

export const stayEnvSchema = baseEnvSchema.merge(databaseEnvSchema).extend({
  SERVICE_NAME: z.string().default('stay-service'),
  PORT: z.coerce.number().int().default(3007),

  /** Verifies access tokens minted by auth-service. */
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().default('staysphere.auth'),
  JWT_AUDIENCE: z.string().default('staysphere.api'),
});

export type StayEnv = z.infer<typeof stayEnvSchema>;

export function loadStayEnv(source: NodeJS.ProcessEnv = process.env): StayEnv {
  return validateEnv(stayEnvSchema, source);
}
