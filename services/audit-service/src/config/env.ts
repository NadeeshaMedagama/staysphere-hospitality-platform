import { baseEnvSchema, databaseEnvSchema, validateEnv } from '@staysphere/service-core';
import { z } from 'zod';

export const auditEnvSchema = baseEnvSchema.merge(databaseEnvSchema).extend({
  SERVICE_NAME: z.string().default('audit-service'),
  PORT: z.coerce.number().int().default(3014),

  /** Verifies access tokens minted by auth-service. */
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().default('staysphere.auth'),
  JWT_AUDIENCE: z.string().default('staysphere.api'),
});

export type AuditEnv = z.infer<typeof auditEnvSchema>;

export function loadAuditEnv(source: NodeJS.ProcessEnv = process.env): AuditEnv {
  return validateEnv(auditEnvSchema, source);
}
