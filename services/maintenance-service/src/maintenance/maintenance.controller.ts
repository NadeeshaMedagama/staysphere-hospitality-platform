import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DomainError, ErrorCode, Permission } from '@staysphere/contracts';
import { RequirePermissions, zodBody, type Principal } from '@staysphere/service-core';
import {
  assignTicketSchema,
  commentSchema,
  createTicketSchema,
  listTicketsQuerySchema,
  resolveTicketSchema,
  type AssignTicketDto,
  type CommentDto,
  type CreateTicketDto,
  type ResolveTicketDto,
} from './dto.js';
import { MaintenanceService } from './maintenance.service.js';

interface AuthenticatedRequest {
  principal?: Principal;
}

@ApiTags('Maintenance')
@Controller({ path: 'maintenance', version: '1' })
export class MaintenanceController {
  constructor(private readonly maintenance: MaintenanceService) {}

  @Get('tickets')
  @RequirePermissions(Permission.MAINTENANCE_MANAGE)
  @ApiOperation({ summary: 'List tickets, most urgent and closest to breach first.' })
  list(@Query() query: Record<string, string>) {
    return this.maintenance.list(listTicketsQuerySchema.parse(query));
  }

  @Get('summary')
  @RequirePermissions(Permission.MAINTENANCE_MANAGE)
  @ApiOperation({ summary: 'Open ticket counts by priority, overdue count and rooms offline.' })
  summary(@Query('hotelId') hotelId: string) {
    if (!hotelId) throw DomainError.validation('hotelId is required.');
    return this.maintenance.summary(hotelId);
  }

  @Get('my-tickets')
  @RequirePermissions(Permission.MAINTENANCE_MANAGE)
  @ApiOperation({ summary: 'The signed-in engineer’s own queue.' })
  mine(@Query('hotelId') hotelId: string, @Req() req: AuthenticatedRequest) {
    if (!hotelId) throw DomainError.validation('hotelId is required.');
    return this.maintenance.list(
      listTicketsQuerySchema.parse({ hotelId, assignedToId: principal(req).id }),
    );
  }

  @Get('tickets/:id')
  @RequirePermissions(Permission.MAINTENANCE_MANAGE)
  @ApiOperation({ summary: 'Fetch a ticket with its comment trail and SLA state.' })
  findOne(@Param('id') id: string) {
    return this.maintenance.findById(id);
  }

  @Post('tickets')
  @ApiOperation({
    summary: 'Raise a ticket. Priority is triaged from the category and room occupancy.',
  })
  create(
    @Body(zodBody(createTicketSchema)) dto: CreateTicketDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const actor = principal(req);
    return this.maintenance.create(dto, actor.id, actor.roles[0]);
  }

  @Post('tickets/:id/assign')
  @HttpCode(200)
  @RequirePermissions(Permission.MAINTENANCE_MANAGE)
  @ApiOperation({ summary: 'Assign a ticket to an engineer.' })
  assign(@Param('id') id: string, @Body(zodBody(assignTicketSchema)) dto: AssignTicketDto) {
    return this.maintenance.assign(id, dto);
  }

  @Post('tickets/:id/start')
  @HttpCode(200)
  @RequirePermissions(Permission.MAINTENANCE_MANAGE)
  @ApiOperation({ summary: 'Start work on a ticket assigned to you.' })
  start(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.maintenance.start(id, principal(req).id);
  }

  @Post('tickets/:id/resolve')
  @HttpCode(200)
  @RequirePermissions(Permission.MAINTENANCE_MANAGE)
  @ApiOperation({ summary: 'Resolve a ticket and, where applicable, return the room to sale.' })
  @ApiResponse({ status: 409, description: 'The ticket has not been started.' })
  resolve(
    @Param('id') id: string,
    @Body(zodBody(resolveTicketSchema)) dto: ResolveTicketDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.maintenance.resolve(id, dto, principal(req).id);
  }

  @Post('tickets/:id/close')
  @HttpCode(200)
  @RequirePermissions(Permission.MAINTENANCE_MANAGE)
  @ApiOperation({ summary: 'Close a ticket.' })
  close(@Param('id') id: string) {
    return this.maintenance.close(id);
  }

  @Post('tickets/:id/comments')
  @RequirePermissions(Permission.MAINTENANCE_MANAGE)
  @ApiOperation({ summary: 'Add a comment to a ticket.' })
  comment(
    @Param('id') id: string,
    @Body(zodBody(commentSchema)) dto: CommentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.maintenance.comment(id, dto, principal(req).id);
  }
}

function principal(req: AuthenticatedRequest): Principal {
  if (!req.principal) {
    throw new DomainError(ErrorCode.UNAUTHENTICATED, 'Authentication is required.');
  }
  return req.principal;
}
