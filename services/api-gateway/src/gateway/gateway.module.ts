import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { loadGatewayEnv, type GatewayEnv } from '../config/env.js';
import { EdgeAuthGuard } from './edge-auth.guard.js';
import { GatewayController } from './gateway.controller.js';
import { ProxyService } from './proxy.service.js';
import { UpstreamRegistry } from './upstream.registry.js';

export const GATEWAY_ENV = Symbol('GATEWAY_ENV');

@Module({
  imports: [JwtModule.register({})],
  controllers: [GatewayController],
  providers: [
    { provide: GATEWAY_ENV, useFactory: (): GatewayEnv => loadGatewayEnv() },
    {
      provide: UpstreamRegistry,
      inject: [GATEWAY_ENV],
      useFactory: (env: GatewayEnv) => new UpstreamRegistry(env),
    },
    {
      provide: ProxyService,
      inject: [UpstreamRegistry, GATEWAY_ENV],
      useFactory: (upstreams: UpstreamRegistry, env: GatewayEnv) =>
        new ProxyService(upstreams, env),
    },
    {
      provide: APP_GUARD,
      inject: [JwtService, GATEWAY_ENV],
      useFactory: (jwt: JwtService, env: GatewayEnv) => new EdgeAuthGuard(jwt, env),
    },
  ],
  exports: [UpstreamRegistry, ProxyService],
})
export class GatewayModule {}
