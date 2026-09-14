import { baseEnvSchema, databaseEnvSchema, validateEnv } from '@staysphere/service-core';
import { z } from 'zod';

export const financeEnvSchema = baseEnvSchema.merge(databaseEnvSchema).extend({
  SERVICE_NAME: z.string().default('finance-service'),
  PORT: z.coerce.number().int().default(3008),

  /** Verifies access tokens minted by auth-service. */
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().default('staysphere.auth'),
  JWT_AUDIENCE: z.string().default('staysphere.api'),
});

export type FinanceEnv = z.infer<typeof financeEnvSchema>;

export function loadFinanceEnv(source: NodeJS.ProcessEnv = process.env): FinanceEnv {
  return validateEnv(financeEnvSchema, source);
}
