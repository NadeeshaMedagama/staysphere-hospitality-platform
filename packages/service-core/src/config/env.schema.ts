import { z } from 'zod';

/**
 * Environment contract shared by every StaySphere service. Services extend this
 * with their own keys; validation runs once at boot so a misconfigured container
 * fails fast and loudly instead of erroring on the first request.
 */
export const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  SERVICE_NAME: z.string().min(1),
  SERVICE_VERSION: z.string().default('0.0.0-dev'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Observability
  METRICS_ENABLED: z.coerce.boolean().default(true),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),

  // Shared infrastructure
  REDIS_URL: z.string().url().optional(),
  KAFKA_BROKERS: z.string().optional(),
  KAFKA_CLIENT_ID: z.string().optional(),
  KAFKA_SSL: z.coerce.boolean().default(false),
  KAFKA_SASL_USERNAME: z.string().optional(),
  KAFKA_SASL_PASSWORD: z.string().optional(),

  // HTTP surface
  CORS_ORIGINS: z.string().default('*'),
  RATE_LIMIT_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
});

export type BaseEnv = z.infer<typeof baseEnvSchema>;

export const databaseEnvSchema = z.object({
  /** Neon PostgreSQL pooled connection string used by the application at runtime. */
  DATABASE_URL: z.string().url(),
  /** Neon direct (non-pooled) connection string used by Prisma Migrate. */
  DIRECT_URL: z.string().url().optional(),
  DATABASE_POOL_SIZE: z.coerce.number().int().positive().default(10),
});

/**
 * Validates `process.env` against a schema, printing every offending key at once
 * rather than failing on the first.
 */
export function validateEnv<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  source: NodeJS.ProcessEnv = process.env,
): z.infer<TSchema> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  • ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}

/** Splits a comma-separated origin list, treating `*` as "allow any origin". */
export function parseCorsOrigins(raw: string): string[] | true {
  const trimmed = raw.trim();
  if (trimmed === '*' || trimmed === '') return true;
  return trimmed
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function parseBrokers(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((broker) => broker.trim())
    .filter(Boolean);
}
