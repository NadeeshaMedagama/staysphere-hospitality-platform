import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import {
  AllExceptionsFilter,
  MetricsInterceptor,
  MetricsService,
  RequestContextMiddleware,
  buildLoggerConfig,
  createHealthController,
  createMetricsController,
} from '@staysphere/service-core';
import { LoggerModule } from 'nestjs-pino';
import { loadGatewayEnv } from './config/env.js';
import { GatewayModule } from './gateway/gateway.module.js';
import { RouteRateLimitGuard } from './gateway/route-rate-limit.guard.js';
import { RealtimeModule } from './realtime/realtime.module.js';

const env = loadGatewayEnv();
const metrics = new MetricsService(env.SERVICE_NAME, env.SERVICE_VERSION);

/**
 * Readiness probes each configured upstream's own `/health`.
 *
 * The gateway is only useful if something is behind it, so an all-upstreams-down
 * gateway should be pulled out of the load balancer rather than serving 503s.
 */
const upstreamProbes = Object.entries({
  auth: env.AUTH_SERVICE_URL,
  booking: env.BOOKING_SERVICE_URL,
  hotel: env.HOTEL_SERVICE_URL,
  room: env.ROOM_SERVICE_URL,
  pricing: env.PRICING_SERVICE_URL,
  payment: env.PAYMENT_SERVICE_URL,
  stay: env.STAY_SERVICE_URL,
  finance: env.FINANCE_SERVICE_URL,
  housekeeping: env.HOUSEKEEPING_SERVICE_URL,
  maintenance: env.MAINTENANCE_SERVICE_URL,
  notification: env.NOTIFICATION_SERVICE_URL,
  review: env.REVIEW_SERVICE_URL,
  reporting: env.REPORTING_SERVICE_URL,
  audit: env.AUDIT_SERVICE_URL,
})
  .filter((entry): entry is [string, string] => Boolean(entry[1]))
  .map(([name, url]) => ({
    name,
    check: async (): Promise<void> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2_000);
      try {
        const response = await fetch(`${url}/health`, { signal: controller.signal });
        if (!response.ok) throw new Error(`${name} returned HTTP ${response.status}`);
      } finally {
        clearTimeout(timeout);
      }
    },
  }));

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: buildLoggerConfig({
        serviceName: env.SERVICE_NAME,
        serviceVersion: env.SERVICE_VERSION,
        level: env.LOG_LEVEL,
        pretty: env.NODE_ENV === 'development',
      }),
    }),
    ThrottlerModule.forRoot([
      { ttl: env.RATE_LIMIT_TTL_SECONDS * 1000, limit: env.RATE_LIMIT_MAX },
    ]),
    GatewayModule,
    RealtimeModule,
  ],
  controllers: [
    createHealthController({
      serviceName: env.SERVICE_NAME,
      serviceVersion: env.SERVICE_VERSION,
      probes: upstreamProbes,
    }),
    createMetricsController(metrics),
  ],
  providers: [
    { provide: MetricsService, useValue: metrics },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useFactory: () => new MetricsInterceptor(metrics) },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Runs after the global throttler and tightens it where the route table says so.
    { provide: APP_GUARD, useClass: RouteRateLimitGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
