import { baseEnvSchema, validateEnv } from '@staysphere/service-core';
import { z } from 'zod';

export const gatewayEnvSchema = baseEnvSchema.extend({
  SERVICE_NAME: z.string().default('api-gateway'),
  PORT: z.coerce.number().int().default(3000),

  /** Upstream service base URLs. */
  AUTH_SERVICE_URL: z.string().url().default('http://auth-service:3001'),
  BOOKING_SERVICE_URL: z.string().url().default('http://booking-service:3002'),
  HOTEL_SERVICE_URL: z.string().url().optional(),
  ROOM_SERVICE_URL: z.string().url().optional(),
  PRICING_SERVICE_URL: z.string().url().optional(),
  PAYMENT_SERVICE_URL: z.string().url().optional(),
  STAY_SERVICE_URL: z.string().url().optional(),
  FINANCE_SERVICE_URL: z.string().url().optional(),
  HOUSEKEEPING_SERVICE_URL: z.string().url().optional(),
  MAINTENANCE_SERVICE_URL: z.string().url().optional(),
  NOTIFICATION_SERVICE_URL: z.string().url().optional(),
  REVIEW_SERVICE_URL: z.string().url().optional(),
  REPORTING_SERVICE_URL: z.string().url().optional(),
  AUDIT_SERVICE_URL: z.string().url().optional(),

  /** Verifies access tokens at the edge so upstreams can trust the principal. */
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().default('staysphere.auth'),
  JWT_AUDIENCE: z.string().default('staysphere.api'),

  UPSTREAM_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  CIRCUIT_FAILURE_THRESHOLD: z.coerce.number().int().positive().default(5),
  CIRCUIT_RESET_MS: z.coerce.number().int().positive().default(30_000),
});

export type GatewayEnv = z.infer<typeof gatewayEnvSchema>;

export function loadGatewayEnv(source: NodeJS.ProcessEnv = process.env): GatewayEnv {
  return validateEnv(gatewayEnvSchema, source);
}
