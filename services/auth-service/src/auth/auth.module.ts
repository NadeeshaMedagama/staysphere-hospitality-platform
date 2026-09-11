import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { AuthorizationGuard } from '@staysphere/service-core';
import { loadAuthEnv, type AuthEnv } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccessTokenGuard } from './access-token.guard.js';
import { AuthController } from './auth.controller.js';
import { AUTH_ENV, AuthService, CLOCK, type Clock } from './auth.service.js';
import { PasswordService } from './password.service.js';
import { TokenService } from './token.service.js';

/** Injectable so tests can substitute a fixed clock. */
const systemClock: Clock = { now: () => new Date() };

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    PrismaService,
    PasswordService,
    AuthService,
    { provide: AUTH_ENV, useFactory: (): AuthEnv => loadAuthEnv() },
    { provide: CLOCK, useValue: systemClock },
    {
      provide: TokenService,
      inject: [JwtService, AUTH_ENV],
      useFactory: (jwt: JwtService, env: AuthEnv) => new TokenService(jwt, env),
    },
    // Ordering matters: authentication resolves the principal that
    // authorisation then evaluates.
    { provide: APP_GUARD, useClass: AccessTokenGuard },
    { provide: APP_GUARD, useClass: AuthorizationGuard },
  ],
  exports: [AuthService, TokenService, PrismaService],
})
export class AuthModule {}
