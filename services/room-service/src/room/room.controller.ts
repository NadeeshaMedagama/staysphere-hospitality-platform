import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DomainError, ErrorCode, Permission, STAFF_ROLES } from '@staysphere/contracts';
import {
  Public,
  RequirePermissions,
  zodBody,
  type Principal,
  RequireRoles,
} from '@staysphere/service-core';
import {
  blockRoomSchema,
  changeRoomStatusSchema,
  createRoomSchema,
  createRoomTypeSchema,
  generateFloorSchema,
  listRoomsQuerySchema,
  type BlockRoomDto,
  type ChangeRoomStatusDto,
  type CreateRoomDto,
  type CreateRoomTypeDto,
  type GenerateFloorDto,
} from './dto.js';
import { RoomService } from './room.service.js';

interface AuthenticatedRequest {
  principal?: Principal;
}

@ApiTags('Rooms')
@Controller({ path: 'rooms', version: '1' })
export class RoomController {
  constructor(private readonly rooms: RoomService) {}

  @Public()
  @Get('types')
  @ApiOperation({ summary: 'List the room types offered at a property.' })
  listTypes(@Query('hotelId') hotelId: string) {
    if (!hotelId) throw DomainError.validation('hotelId is required.');
    return this.rooms.listRoomTypes(hotelId);
  }

  @Post('types')
  @RequirePermissions(Permission.ROOM_WRITE)
  @ApiOperation({ summary: 'Define a room type.' })
  @ApiResponse({ status: 409, description: 'That room type already exists at the property.' })
  createType(@Body(zodBody(createRoomTypeSchema)) dto: CreateRoomTypeDto) {
    return this.rooms.createRoomType(dto);
  }

  @Get()
  // Staff only. ROOM_READ is deliberately granted to guests so they can
  // browse room types, so it cannot gate an operational view that exposes
  // status notes, block reasons and status history.
  @RequireRoles(...STAFF_ROLES)
  @RequirePermissions(Permission.ROOM_READ)
  @ApiOperation({ summary: 'List rooms, filtered by floor, type or status.' })
  list(@Query() query: Record<string, string>) {
    return this.rooms.list(listRoomsQuerySchema.parse(query));
  }

  @Get('board')
  // Staff only. ROOM_READ is deliberately granted to guests so they can
  // browse room types, so it cannot gate an operational view that exposes
  // status notes, block reasons and status history.
  @RequireRoles(...STAFF_ROLES)
  @RequirePermissions(Permission.ROOM_READ)
  @ApiOperation({ summary: 'The live floor board, grouped by floor.' })
  board(@Query('hotelId') hotelId: string) {
    if (!hotelId) throw DomainError.validation('hotelId is required.');
    return this.rooms.floorBoard(hotelId);
  }

  @Get(':id')
  // Staff only. ROOM_READ is deliberately granted to guests so they can
  // browse room types, so it cannot gate an operational view that exposes
  // status notes, block reasons and status history.
  @RequireRoles(...STAFF_ROLES)
  @RequirePermissions(Permission.ROOM_READ)
  @ApiOperation({ summary: 'Fetch a room with its recent status history.' })
  findOne(@Param('id') id: string) {
    return this.rooms.findById(id);
  }

  @Post()
  @RequirePermissions(Permission.ROOM_WRITE)
  @ApiOperation({ summary: 'Create a single room.' })
  create(@Body(zodBody(createRoomSchema)) dto: CreateRoomDto) {
    return this.rooms.createRoom(dto);
  }

  @Post('generate-floor')
  @RequirePermissions(Permission.ROOM_WRITE)
  @ApiOperation({ summary: 'Create an entire floor of rooms in one transaction.' })
  @ApiResponse({ status: 409, description: 'One or more room numbers already exist.' })
  generateFloor(@Body(zodBody(generateFloorSchema)) dto: GenerateFloorDto) {
    return this.rooms.generateFloor(dto);
  }

  @Post(':id/status')
  @HttpCode(200)
  @RequirePermissions(Permission.ROOM_WRITE)
  @ApiOperation({ summary: 'Change a room’s operational status.' })
  @ApiResponse({
    status: 409,
    description: 'The transition is not permitted from the current status.',
  })
  changeStatus(
    @Param('id') id: string,
    @Body(zodBody(changeRoomStatusSchema)) dto: ChangeRoomStatusDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.rooms.changeStatus(id, dto, principal(req).id);
  }

  @Post(':id/block')
  @HttpCode(200)
  @RequirePermissions(Permission.ROOM_WRITE)
  @ApiOperation({ summary: 'Withhold a room from sale.' })
  block(
    @Param('id') id: string,
    @Body(zodBody(blockRoomSchema)) dto: BlockRoomDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.rooms.block(id, dto, principal(req).id);
  }

  @Delete(':id/block')
  @HttpCode(200)
  @RequirePermissions(Permission.ROOM_WRITE)
  @ApiOperation({ summary: 'Return a withheld room to sale.' })
  unblock(@Param('id') id: string) {
    return this.rooms.unblock(id);
  }
}

function principal(req: AuthenticatedRequest): Principal {
  if (!req.principal) {
    throw new DomainError(ErrorCode.UNAUTHENTICATED, 'Authentication is required.');
  }
  return req.principal;
}
