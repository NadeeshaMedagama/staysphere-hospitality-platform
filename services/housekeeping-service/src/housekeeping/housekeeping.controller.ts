import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DomainError, ErrorCode, Permission } from '@staysphere/contracts';
import { RequirePermissions, zodBody, type Principal } from '@staysphere/service-core';
import {
  assignTaskSchema,
  completeTaskSchema,
  createShiftSchema,
  createTaskSchema,
  listTasksQuerySchema,
  verifyTaskSchema,
  type AssignTaskDto,
  type CompleteTaskDto,
  type CreateShiftDto,
  type CreateTaskDto,
  type VerifyTaskDto,
} from './dto.js';
import { HousekeepingService } from './housekeeping.service.js';

interface AuthenticatedRequest {
  principal?: Principal;
}

@ApiTags('Housekeeping')
@Controller({ path: 'housekeeping', version: '1' })
export class HousekeepingController {
  constructor(private readonly housekeeping: HousekeepingService) {}

  @Get('board')
  @RequirePermissions(Permission.HOUSEKEEPING_MANAGE)
  @ApiOperation({
    summary: 'Open work, ordered by urgency then by corridor so a round is walkable.',
  })
  board(@Query('hotelId') hotelId: string) {
    if (!hotelId) throw DomainError.validation('hotelId is required.');
    return this.housekeeping.board(hotelId);
  }

  @Get('tasks')
  @RequirePermissions(Permission.HOUSEKEEPING_MANAGE)
  @ApiOperation({ summary: 'List cleaning tasks with filtering.' })
  list(@Query() query: Record<string, string>) {
    return this.housekeeping.list(listTasksQuerySchema.parse(query));
  }

  @Get('my-tasks')
  @RequirePermissions(Permission.HOUSEKEEPING_MANAGE)
  @ApiOperation({ summary: 'The signed-in housekeeper’s own queue.' })
  myTasks(@Query('hotelId') hotelId: string, @Req() req: AuthenticatedRequest) {
    if (!hotelId) throw DomainError.validation('hotelId is required.');
    return this.housekeeping.list(
      listTasksQuerySchema.parse({ hotelId, assignedToId: principal(req).id }),
    );
  }

  @Post('tasks')
  @RequirePermissions(Permission.HOUSEKEEPING_MANAGE)
  @ApiOperation({ summary: 'Queue a cleaning task; priority is computed from the next arrival.' })
  createTask(@Body(zodBody(createTaskSchema)) dto: CreateTaskDto) {
    return this.housekeeping.createTask(dto);
  }

  @Post('tasks/:id/assign')
  @HttpCode(200)
  @RequirePermissions(Permission.HOUSEKEEPING_MANAGE)
  @ApiOperation({ summary: 'Assign a task, or let the service balance it across the shift.' })
  @ApiResponse({ status: 409, description: 'Every housekeeper on shift is at capacity.' })
  assign(@Param('id') id: string, @Body(zodBody(assignTaskSchema)) dto: AssignTaskDto) {
    return this.housekeeping.assign(id, dto);
  }

  @Post('tasks/:id/start')
  @HttpCode(200)
  @RequirePermissions(Permission.HOUSEKEEPING_MANAGE)
  @ApiOperation({ summary: 'Start a task assigned to you.' })
  start(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.housekeeping.start(id, principal(req).id);
  }

  @Post('tasks/:id/complete')
  @HttpCode(200)
  @RequirePermissions(Permission.HOUSEKEEPING_MANAGE)
  @ApiOperation({ summary: 'Finish a clean. Every required checklist item must pass.' })
  @ApiResponse({ status: 409, description: 'Required checklist items are outstanding.' })
  complete(
    @Param('id') id: string,
    @Body(zodBody(completeTaskSchema)) dto: CompleteTaskDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.housekeeping.complete(id, dto, principal(req).id);
  }

  @Post('tasks/:id/verify')
  @HttpCode(200)
  @RequirePermissions(Permission.HOUSEKEEPING_MANAGE)
  @ApiOperation({ summary: 'Record an inspection. A failure reopens the task as rework.' })
  verify(
    @Param('id') id: string,
    @Body(zodBody(verifyTaskSchema)) dto: VerifyTaskDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.housekeeping.verify(id, dto, principal(req).id);
  }

  @Post('shifts')
  @RequirePermissions(Permission.STAFF_MANAGE)
  @ApiOperation({ summary: 'Roster a housekeeper onto a shift with a room capacity.' })
  createShift(@Body(zodBody(createShiftSchema)) dto: CreateShiftDto) {
    return this.housekeeping.createShift(dto);
  }
}

function principal(req: AuthenticatedRequest): Principal {
  if (!req.principal) {
    throw new DomainError(ErrorCode.UNAUTHENTICATED, 'Authentication is required.');
  }
  return req.principal;
}
