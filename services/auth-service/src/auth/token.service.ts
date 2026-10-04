import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Role } from '@staysphere/contracts';
import { randomBytes } from 'node:crypto';
import type { AuthEnv } from '../config/env.js';
import { hashRefreshToken } from './refresh-rotation.js';

export interface IssueTokensInput {
  readonly userId: string;
  readonly email: string;
  readonly roles: readonly Role[];
  readonly hotelId?: string | null;
  readonly sessionId: string;
}

export interface IssuedTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly refreshTokenHash: string;
  readonly accessTokenExpiresAt: Date;
  readonly refreshTokenExpiresAt: Date;
  readonly tokenType: 'Bearer';
  readonly expiresIn: number;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly env: AuthEnv,
  ) {}

  /**
   * Issues an access/refresh pair.
   *
   * The refresh token is opaque CSPRNG bytes rather than a JWT: revocation must
   * be authoritative, and a self-contained JWT would remain valid until expiry
   * even after a sign-out.
   */
  async issue(input: IssueTokensInput, now: Date = new Date()): Promise<IssuedTokens> {
    const accessTokenExpiresAt = new Date(now.getTime() + this.env.ACCESS_TOKEN_TTL_SECONDS * 1000);
    const refreshTokenExpiresAt = new Date(
      now.getTime() + this.env.REFRESH_TOKEN_TTL_SECONDS * 1000,
    );

    const accessToken = await this.jwt.signAsync(
      {
        sub: input.userId,
        email: input.email,
        roles: input.roles,
        ...(input.hotelId ? { hotelId: input.hotelId } : {}),
        sid: input.sessionId,
      },
      {
        secret: this.env.JWT_ACCESS_SECRET,
        issuer: this.env.JWT_ISSUER,
        audience: this.env.JWT_AUDIENCE,
        expiresIn: this.env.ACCESS_TOKEN_TTL_SECONDS,
      },
    );

    const refreshToken = randomBytes(48).toString('base64url');

    return {
      accessToken,
      refreshToken,
      refreshTokenHash: hashRefreshToken(refreshToken),
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
      tokenType: 'Bearer',
      expiresIn: this.env.ACCESS_TOKEN_TTL_SECONDS,
    };
  }

  async verifyAccessToken(token: string): Promise<Record<string, unknown>> {
    return this.jwt.verifyAsync(token, {
      secret: this.env.JWT_ACCESS_SECRET,
      issuer: this.env.JWT_ISSUER,
      audience: this.env.JWT_AUDIENCE,
    });
  }
}
