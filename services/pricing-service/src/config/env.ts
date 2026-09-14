import { baseEnvSchema, databaseEnvSchema, validateEnv } from '@staysphere/service-core';
import { z } from 'zod';

export const pricingEnvSchema = baseEnvSchema.merge(databaseEnvSchema).extend({
  SERVICE_NAME: z.string().default('pricing-service'),
  PORT: z.coerce.number().int().default(3005),

  /** Verifies access tokens minted by auth-service. */
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().default('staysphere.auth'),
  JWT_AUDIENCE: z.string().default('staysphere.api'),
});

export type PricingEnv = z.infer<typeof pricingEnvSchema>;

export function loadPricingEnv(source: NodeJS.ProcessEnv = process.env): PricingEnv {
  return validateEnv(pricingEnvSchema, source);
}
