import { baseEnvSchema, databaseEnvSchema, validateEnv } from '@staysphere/service-core';
import { z } from 'zod';

export const authEnvSchema = baseEnvSchema.merge(databaseEnvSchema).extend({
  SERVICE_NAME: z.string().default('auth-service'),
  PORT: z.coerce.number().int().default(3001),

  /** Signing key for access tokens. Must be >= 32 bytes of entropy. */
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ISSUER: z.string().default('staysphere.auth'),
  JWT_AUDIENCE: z.string().default('staysphere.api'),

  /** Short-lived by design: revocation is enforced at refresh time. */
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60 * 24 * 30),

  PASSWORD_MIN_LENGTH: z.coerce.number().int().min(8).default(12),
  MAX_FAILED_LOGINS: z.coerce.number().int().positive().default(5),
  LOCKOUT_MINUTES: z.coerce.number().int().positive().default(15),
});

export type AuthEnv = z.infer<typeof authEnvSchema>;

export function loadAuthEnv(source: NodeJS.ProcessEnv = process.env): AuthEnv {
  return validateEnv(authEnvSchema, source);
}
