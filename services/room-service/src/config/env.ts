import { baseEnvSchema, databaseEnvSchema, validateEnv } from '@staysphere/service-core';
import { z } from 'zod';

export const roomEnvSchema = baseEnvSchema.merge(databaseEnvSchema).extend({
  SERVICE_NAME: z.string().default('room-service'),
  PORT: z.coerce.number().int().default(3004),

  /** Verifies access tokens minted by auth-service. */
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().default('staysphere.auth'),
  JWT_AUDIENCE: z.string().default('staysphere.api'),
});

export type RoomEnv = z.infer<typeof roomEnvSchema>;

export function loadRoomEnv(source: NodeJS.ProcessEnv = process.env): RoomEnv {
  return validateEnv(roomEnvSchema, source);
}
