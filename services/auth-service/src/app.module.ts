import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import {
  AllExceptionsFilter,
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
import { AuthModule } from './auth/auth.module.js';
import { loadAuthEnv } from './config/env.js';
import { PrismaService } from './prisma/prisma.service.js';

const env = loadAuthEnv();
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
    AuthModule,
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
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Order matters: the principal must be attached before the request
    // context captures it for logging, and long before any guard runs.
    consumer.apply(ForwardedPrincipalMiddleware, RequestContextMiddleware).forRoutes('*');
  }
}
