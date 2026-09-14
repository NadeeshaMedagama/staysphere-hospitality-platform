import { baseEnvSchema, databaseEnvSchema, validateEnv } from '@staysphere/service-core';
import { z } from 'zod';

export const paymentEnvSchema = baseEnvSchema.merge(databaseEnvSchema).extend({
  SERVICE_NAME: z.string().default('payment-service'),
  PORT: z.coerce.number().int().default(3006),

  /** Verifies access tokens minted by auth-service. */
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().default('staysphere.auth'),
  JWT_AUDIENCE: z.string().default('staysphere.api'),
});

export type PaymentEnv = z.infer<typeof paymentEnvSchema>;

export function loadPaymentEnv(source: NodeJS.ProcessEnv = process.env): PaymentEnv {
  return validateEnv(paymentEnvSchema, source);
}
