import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DomainError, ErrorCode } from '@staysphere/contracts';
import { Public, zodBody, type Principal } from '@staysphere/service-core';
import { AuthService, type SessionContext } from './auth.service.js';
import {
  changePasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  type ChangePasswordDto,
  type LoginDto,
  type RefreshDto,
  type RegisterDto,
} from './dto.js';

interface AuthenticatedRequest {
  principal?: Principal;
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
}

@ApiTags('Authentication')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Create a guest account and open a session.' })
  @ApiResponse({ status: 201, description: 'Account created; tokens issued.' })
  @ApiResponse({ status: 409, description: 'The email address is already registered.' })
  register(@Body(zodBody(registerSchema)) dto: RegisterDto, @Req() req: AuthenticatedRequest) {
    return this.auth.register(dto, sessionContext(req));
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Exchange credentials for an access/refresh token pair.' })
  @ApiResponse({ status: 401, description: 'Email or password is incorrect.' })
  @ApiResponse({ status: 423, description: 'Account temporarily locked after repeated failures.' })
  login(@Body(zodBody(loginSchema)) dto: LoginDto, @Req() req: AuthenticatedRequest) {
    return this.auth.login(dto, sessionContext(req));
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotate a refresh token for a fresh token pair.' })
  @ApiResponse({ status: 401, description: 'Token expired, revoked, or replayed.' })
  refresh(@Body(zodBody(refreshSchema)) dto: RefreshDto, @Req() req: AuthenticatedRequest) {
    return this.auth.refresh(dto.refreshToken, sessionContext(req));
  }

  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke the current session and all of its refresh tokens.' })
  async logout(@Req() req: AuthenticatedRequest): Promise<void> {
    await this.auth.logout(requirePrincipal(req).sessionId);
  }

  @Get('me')
  @ApiOperation({ summary: 'Return the authenticated principal.' })
  me(@Req() req: AuthenticatedRequest) {
    return this.auth.me(requirePrincipal(req).id);
  }

  @Post('change-password')
  @HttpCode(204)
  @ApiOperation({ summary: 'Change the password and sign out every other session.' })
  async changePassword(
    @Body(zodBody(changePasswordSchema)) dto: ChangePasswordDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    await this.auth.changePassword(requirePrincipal(req).id, dto);
  }
}

function sessionContext(req: AuthenticatedRequest): SessionContext {
  const userAgent = req.headers['user-agent'];
  return {
    ...(typeof userAgent === 'string' ? { userAgent } : {}),
    ...(req.ip ? { ipAddress: req.ip } : {}),
  };
}

function requirePrincipal(req: AuthenticatedRequest): Principal {
  if (!req.principal) {
    throw new DomainError(ErrorCode.UNAUTHENTICATED, 'Authentication is required.');
  }
  return req.principal;
}
