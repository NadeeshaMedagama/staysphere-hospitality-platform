import { Inject, Injectable, Logger } from '@nestjs/common';
import { DomainError, ErrorCode, Role, Topic, buildEvent, EventType } from '@staysphere/contracts';
import { nanoid } from 'nanoid';
import type { AuthEnv } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ChangePasswordDto, LoginDto, RegisterDto } from './dto.js';
import { evaluateLockout, registerFailure, registerSuccess } from './lockout.js';
import { assertPasswordAcceptable } from './password.policy.js';
import { PasswordService } from './password.service.js';
import { evaluateRefresh, hashRefreshToken, reuseDetectedError } from './refresh-rotation.js';
import { TokenService, type IssuedTokens } from './token.service.js';

export const AUTH_ENV = Symbol('AUTH_ENV');
export const CLOCK = Symbol('CLOCK');

export interface Clock {
  now(): Date;
}

export interface SessionContext {
  readonly userAgent?: string;
  readonly ipAddress?: string;
}

export interface AuthenticatedResult {
  readonly user: {
    id: string;
    email: string;
    fullName: string;
    roles: Role[];
    hotelId: string | null;
    status: string;
  };
  readonly tokens: Omit<IssuedTokens, 'refreshTokenHash'>;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    @Inject(AUTH_ENV) private readonly env: AuthEnv,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async register(dto: RegisterDto, context: SessionContext): Promise<AuthenticatedResult> {
    assertPasswordAcceptable(
      dto.password,
      {
        minLength: this.env.PASSWORD_MIN_LENGTH,
        requireUppercase: true,
        requireLowercase: true,
        requireDigit: true,
        requireSymbol: true,
      },
      { email: dto.email, fullName: dto.fullName },
    );

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new DomainError(
        ErrorCode.EMAIL_ALREADY_REGISTERED,
        'An account already exists for this email address.',
      );
    }

    const passwordHash = await this.passwords.hash(dto.password);
    const now = this.clock.now();

    // The user row and the `identity.user-registered` event are written in one
    // transaction: the welcome email can never be sent for an account that was
    // rolled back, and an account can never be created without its event.
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          fullName: dto.fullName,
          phone: dto.phone ?? null,
          roles: [Role.CUSTOMER],
          status: 'PENDING_VERIFICATION',
        },
      });

      const event = buildEvent({
        eventId: `evt_${nanoid(20)}`,
        type: EventType.USER_REGISTERED,
        version: 1,
        source: this.env.SERVICE_NAME,
        correlationId: `reg_${nanoid(16)}`,
        occurredAt: now,
        payload: {
          userId: created.id,
          email: created.email,
          fullName: created.fullName,
          roles: created.roles,
          verificationRequired: true,
        },
      });

      await tx.outboxEvent.create({
        data: {
          topic: Topic.IDENTITY,
          partitionKey: created.id,
          eventType: event.type,
          payload: event as unknown as object,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: created.id,
          action: 'auth.register',
          resource: 'user',
          resourceId: created.id,
          ipAddress: context.ipAddress ?? null,
          userAgent: context.userAgent ?? null,
        },
      });

      return created;
    });

    return this.startSession(user, context);
  }

  async login(dto: LoginDto, context: SessionContext): Promise<AuthenticatedResult> {
    const now = this.clock.now();
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    // Uniform failure for both "no such user" and "wrong password" so the
    // endpoint cannot be used to enumerate which emails hold an account.
    if (!user) {
      await this.passwords.verify(DUMMY_HASH, dto.password);
      throw new DomainError(ErrorCode.INVALID_CREDENTIALS, 'Email or password is incorrect.');
    }

    const lockout = evaluateLockout(
      { failedLoginCount: user.failedLoginCount, lockedUntil: user.lockedUntil },
      now,
    );
    if (lockout.locked) {
      throw new DomainError(
        ErrorCode.ACCOUNT_LOCKED,
        'Too many failed sign-in attempts. Please try again shortly.',
        { details: { retryAfterSeconds: lockout.retryAfterSeconds } },
      );
    }

    const passwordMatches = await this.passwords.verify(user.passwordHash, dto.password);
    if (!passwordMatches) {
      const next = registerFailure(
        { failedLoginCount: user.failedLoginCount, lockedUntil: user.lockedUntil },
        { maxFailedAttempts: this.env.MAX_FAILED_LOGINS, lockoutMinutes: this.env.LOCKOUT_MINUTES },
        now,
      );
      await this.prisma.user.update({ where: { id: user.id }, data: next });
      throw new DomainError(ErrorCode.INVALID_CREDENTIALS, 'Email or password is incorrect.');
    }

    if (user.status === 'SUSPENDED' || user.status === 'DEACTIVATED') {
      throw new DomainError(ErrorCode.ACCOUNT_DISABLED, 'This account is no longer active.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { ...registerSuccess(), lastLoginAt: now },
    });

    return this.startSession(user, context);
  }

  /** Exchanges a refresh token, rotating it and detecting replay. */
  async refresh(rawRefreshToken: string, context: SessionContext): Promise<AuthenticatedResult> {
    const now = this.clock.now();
    const tokenHash = hashRefreshToken(rawRefreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    const outcome = evaluateRefresh(stored, now);

    if (outcome.kind === 'REUSE_DETECTED') {
      this.logger.warn(
        { sessionId: outcome.sessionId, userId: outcome.userId },
        'Refresh token replay detected — revoking the entire session',
      );
      await this.revokeSession(outcome.sessionId, 'REFRESH_TOKEN_REUSE');
      throw reuseDetectedError();
    }

    const user = await this.prisma.user.findUnique({ where: { id: outcome.userId } });
    if (!user || user.status === 'SUSPENDED' || user.status === 'DEACTIVATED') {
      await this.revokeSession(outcome.sessionId, 'ACCOUNT_INACTIVE');
      throw new DomainError(ErrorCode.ACCOUNT_DISABLED, 'This account is no longer active.');
    }

    const issued = await this.tokens.issue(
      {
        userId: user.id,
        email: user.email,
        roles: user.roles as Role[],
        hotelId: user.hotelId,
        sessionId: outcome.sessionId,
      },
      now,
    );

    await this.prisma.$transaction([
      this.prisma.refreshToken.update({
        where: { tokenHash },
        data: { rotatedAt: now, replacedByJti: issued.refreshTokenHash },
      }),
      this.prisma.refreshToken.create({
        data: {
          userId: user.id,
          sessionId: outcome.sessionId,
          tokenHash: issued.refreshTokenHash,
          expiresAt: issued.refreshTokenExpiresAt,
        },
      }),
      this.prisma.session.update({
        where: { id: outcome.sessionId },
        data: { lastSeenAt: now, ipAddress: context.ipAddress ?? null },
      }),
    ]);

    return { user: toPublicUser(user), tokens: stripHash(issued) };
  }

  async logout(sessionId: string): Promise<void> {
    await this.revokeSession(sessionId, 'USER_SIGNED_OUT');
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw DomainError.notFound('User', userId);

    if (!(await this.passwords.verify(user.passwordHash, dto.currentPassword))) {
      throw new DomainError(ErrorCode.INVALID_CREDENTIALS, 'The current password is incorrect.');
    }

    assertPasswordAcceptable(
      dto.newPassword,
      {
        minLength: this.env.PASSWORD_MIN_LENGTH,
        requireUppercase: true,
        requireLowercase: true,
        requireDigit: true,
        requireSymbol: true,
      },
      { email: user.email, fullName: user.fullName },
    );

    const passwordHash = await this.passwords.hash(dto.newPassword);
    const now = this.clock.now();

    // Changing a password invalidates every other session — that is the whole
    // point of changing it after a suspected compromise.
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      this.prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now, revokeReason: 'PASSWORD_CHANGED' },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      }),
      this.prisma.auditLog.create({
        data: {
          actorId: userId,
          action: 'auth.password-changed',
          resource: 'user',
          resourceId: userId,
        },
      }),
    ]);
  }

  async me(userId: string): Promise<AuthenticatedResult['user']> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw DomainError.notFound('User', userId);
    return toPublicUser(user);
  }

  private async startSession(
    user: {
      id: string;
      email: string;
      fullName: string;
      roles: string[];
      hotelId: string | null;
      status: string;
    },
    context: SessionContext,
  ): Promise<AuthenticatedResult> {
    const now = this.clock.now();
    const sessionExpiry = new Date(now.getTime() + this.env.REFRESH_TOKEN_TTL_SECONDS * 1000);

    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        userAgent: context.userAgent ?? null,
        ipAddress: context.ipAddress ?? null,
        expiresAt: sessionExpiry,
      },
    });

    const issued = await this.tokens.issue(
      {
        userId: user.id,
        email: user.email,
        roles: user.roles as Role[],
        hotelId: user.hotelId,
        sessionId: session.id,
      },
      now,
    );

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        sessionId: session.id,
        tokenHash: issued.refreshTokenHash,
        expiresAt: issued.refreshTokenExpiresAt,
      },
    });

    return { user: toPublicUser(user), tokens: stripHash(issued) };
  }

  private async revokeSession(sessionId: string, reason: string): Promise<void> {
    const now = this.clock.now();
    await this.prisma.$transaction([
      this.prisma.session.updateMany({
        where: { id: sessionId, revokedAt: null },
        data: { revokedAt: now, revokeReason: reason },
      }),
      this.prisma.refreshToken.updateMany({
        where: { sessionId, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);
  }
}

/**
 * A valid Argon2id hash of a random value, verified against when no user is
 * found. Skipping verification for unknown emails would make the "no such user"
 * path measurably faster and leak account existence through timing.
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c3RheXNwaGVyZXNhbHQ$Pp3Vv1nJ7bqjS9pQxYy1nD1n7q6QpZ0R0k1sK9m2ZbY';

function toPublicUser(user: {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
  hotelId: string | null;
  status: string;
}): AuthenticatedResult['user'] {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    roles: user.roles as Role[],
    hotelId: user.hotelId,
    status: user.status,
  };
}

function stripHash(issued: IssuedTokens): Omit<IssuedTokens, 'refreshTokenHash'> {
  const { refreshTokenHash: _refreshTokenHash, ...rest } = issued;
  return rest;
}
