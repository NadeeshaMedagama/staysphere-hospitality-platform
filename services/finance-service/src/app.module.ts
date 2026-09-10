import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import {
  AllExceptionsFilter,
  AuthorizationGuard,
  ForwardedPrincipalMiddleware,
  MetricsInterceptor,
  MetricsService,
  RequestContextMiddleware,
  ResponseEnvelopeInterceptor,
  buildLoggerConfig,
  createHealthController,
  createMetricsController,
} from '@staysphere/service-core';
import { LoggerModule } from 'nestjs-pino';
import { loadFinanceEnv } from './config/env.js';
import { PrismaService } from './prisma/prisma.service.js';
import { FinanceModule } from './finance/finance.module.js';

const env = loadFinanceEnv();
const metrics = new MetricsService(env.SERVICE_NAME, env.SERVICE_VERSION);

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
    FinanceModule,
  ],
  controllers: [
    createHealthController({
      serviceName: env.SERVICE_NAME,
      serviceVersion: env.SERVICE_VERSION,
      probes: [
        {
          name: 'database',
          check: async () => {
            await new PrismaService().ping();
          },
        },
      ],
    }),
    createMetricsController(metrics),
  ],
  providers: [
    { provide: MetricsService, useValue: metrics },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    { provide: APP_INTERCEPTOR, useFactory: () => new MetricsInterceptor(metrics) },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Without this, @RequireRoles and @RequirePermissions are inert: the
    // decorators write metadata that nothing reads, and every protected
    // route is reachable by any authenticated caller. The guard fails
    // closed on a missing principal, so a route is protected unless it is
    // deliberately marked @Public().
    { provide: APP_GUARD, useClass: AuthorizationGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Order matters: the principal must be attached before the request
    // context captures it for logging, and long before any guard runs.
    consumer.apply(ForwardedPrincipalMiddleware, RequestContextMiddleware).forRoutes('*');
  }
}
