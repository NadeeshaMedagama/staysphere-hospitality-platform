import { baseEnvSchema, databaseEnvSchema, validateEnv } from '@staysphere/service-core';
import { z } from 'zod';

export const notificationEnvSchema = baseEnvSchema.merge(databaseEnvSchema).extend({
  SERVICE_NAME: z.string().default('notification-service'),
  PORT: z.coerce.number().int().default(3011),

  /** Verifies access tokens minted by auth-service. */
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().default('staysphere.auth'),
  JWT_AUDIENCE: z.string().default('staysphere.api'),
});

export type NotificationEnv = z.infer<typeof notificationEnvSchema>;

export function loadNotificationEnv(source: NodeJS.ProcessEnv = process.env): NotificationEnv {
  return validateEnv(notificationEnvSchema, source);
}
