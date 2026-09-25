import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DomainError, ErrorCode, Permission, Role } from '@staysphere/contracts';
import {
  RequirePermissions,
  RequireRoles,
  zodBody,
  type Principal,
} from '@staysphere/service-core';
import {
  listNotificationsQuerySchema,
  sendNotificationSchema,
  updatePreferenceSchema,
  upsertTemplateSchema,
  type SendNotificationDto,
  type UpdatePreferenceDto,
  type UpsertTemplateDto,
} from './dto.js';
import { NotificationService } from './notification.service.js';

interface AuthenticatedRequest {
  principal?: Principal;
}

@ApiTags('Notifications')
@Controller({ path: 'notifications', version: '1' })
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  @ApiOperation({ summary: 'The signed-in user’s notification centre.' })
  inbox(@Query() query: Record<string, string>, @Req() req: AuthenticatedRequest) {
    return this.notifications.inbox(principal(req).id, listNotificationsQuerySchema.parse(query));
  }

  @Post(':id/read')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark one notification as read.' })
  markRead(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.notifications.markRead(id, principal(req).id);
  }

  @Post('read-all')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark every in-app notification as read.' })
  markAllRead(@Req() req: AuthenticatedRequest) {
    return this.notifications.markAllRead(principal(req).id);
  }

  @Put('preferences')
  @ApiOperation({ summary: 'Opt in or out of an optional message on a channel.' })
  updatePreference(
    @Body(zodBody(updatePreferenceSchema)) dto: UpdatePreferenceDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.notifications.updatePreference(principal(req).id, dto);
  }

  @Post('send')
  @RequirePermissions(Permission.SYSTEM_ADMIN)
  @ApiOperation({
    summary: 'Queue a message. Normally driven by domain events, not called directly.',
  })
  send(@Body(zodBody(sendNotificationSchema)) dto: SendNotificationDto) {
    return this.notifications.send(dto);
  }

  @Put('templates')
  @RequireRoles(Role.SUPER_ADMIN, Role.HOTEL_ADMIN)
  @ApiOperation({ summary: 'Create or update a message template.' })
  upsertTemplate(@Body(zodBody(upsertTemplateSchema)) dto: UpsertTemplateDto) {
    return this.notifications.upsertTemplate(dto);
  }
}

function principal(req: AuthenticatedRequest): Principal {
  if (!req.principal) {
    throw new DomainError(ErrorCode.UNAUTHENTICATED, 'Authentication is required.');
  }
  return req.principal;
}
