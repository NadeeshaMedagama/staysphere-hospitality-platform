import { baseEnvSchema, databaseEnvSchema, validateEnv } from '@staysphere/service-core';
import { z } from 'zod';

export const reportingEnvSchema = baseEnvSchema.merge(databaseEnvSchema).extend({
  SERVICE_NAME: z.string().default('reporting-service'),
  PORT: z.coerce.number().int().default(3013),

  /** Verifies access tokens minted by auth-service. */
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().default('staysphere.auth'),
  JWT_AUDIENCE: z.string().default('staysphere.api'),
});

export type ReportingEnv = z.infer<typeof reportingEnvSchema>;

export function loadReportingEnv(source: NodeJS.ProcessEnv = process.env): ReportingEnv {
  return validateEnv(reportingEnvSchema, source);
}
