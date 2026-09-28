import { Module } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { loadGatewayEnv, type GatewayEnv } from '../config/env.js';
import { RealtimeGateway } from './realtime.gateway.js';

export const REALTIME_ENV = Symbol('REALTIME_ENV');

@Module({
  imports: [JwtModule.register({})],
  providers: [
    { provide: REALTIME_ENV, useFactory: (): GatewayEnv => loadGatewayEnv() },
    {
      provide: RealtimeGateway,
      inject: [JwtService, REALTIME_ENV],
      useFactory: (jwt: JwtService, env: GatewayEnv) => new RealtimeGateway(jwt, env),
    },
  ],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
