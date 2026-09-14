import { baseEnvSchema, databaseEnvSchema, validateEnv } from '@staysphere/service-core';
import { z } from 'zod';

export const reviewEnvSchema = baseEnvSchema.merge(databaseEnvSchema).extend({
  SERVICE_NAME: z.string().default('review-service'),
  PORT: z.coerce.number().int().default(3012),

  /** Verifies access tokens minted by auth-service. */
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().default('staysphere.auth'),
  JWT_AUDIENCE: z.string().default('staysphere.api'),
});

export type ReviewEnv = z.infer<typeof reviewEnvSchema>;

export function loadReviewEnv(source: NodeJS.ProcessEnv = process.env): ReviewEnv {
  return validateEnv(reviewEnvSchema, source);
}
