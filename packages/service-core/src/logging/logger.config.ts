import { currentContext } from './request-context.js';

export interface LoggerOptions {
  serviceName: string;
  serviceVersion: string;
  level: string;
  pretty: boolean;
}

/** Header/body fields that must never reach the log sink. */
export const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'req.body.password',
  'req.body.currentPassword',
  'req.body.newPassword',
  'req.body.refreshToken',
  'req.body.token',
  'req.body.cardNumber',
  'req.body.cvv',
  'res.headers["set-cookie"]',
  '*.password',
  '*.passwordHash',
  '*.refreshToken',
  '*.accessToken',
  '*.secret',
];

/**
 * Builds the pino configuration used by `nestjs-pino`. Every line carries the
 * service identity plus the active request/correlation ids, which is what makes
 * a single guest interaction traceable across all services in Loki/ELK.
 */
export function buildLoggerConfig(options: LoggerOptions): Record<string, unknown> {
  return {
    level: options.level,
    base: { service: options.serviceName, version: options.serviceVersion },
    redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' },
    mixin() {
      const context = currentContext();
      if (!context) return {};
      return {
        requestId: context.requestId,
        correlationId: context.correlationId,
        ...(context.userId ? { userId: context.userId } : {}),
        ...(context.hotelId ? { hotelId: context.hotelId } : {}),
      };
    },
    formatters: {
      level: (label: string) => ({ level: label }),
    },
    timestamp: () => `,"time":"${new Date().toISOString()}"`,
    ...(options.pretty
      ? {
          transport: {
            target: 'pino-pretty',
            options: { colorize: true, singleLine: false, translateTime: 'HH:MM:ss.l' },
          },
        }
      : {}),
  };
}
