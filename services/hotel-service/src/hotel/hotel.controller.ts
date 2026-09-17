import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DomainError, ErrorCode, Permission, Role, STAFF_ROLES } from '@staysphere/contracts';
import {
  Public,
  RequirePermissions,
  RequireRoles,
  zodBody,
  type Principal,
} from '@staysphere/service-core';
import {
  createBranchSchema,
  createHotelSchema,
  listHotelsQuerySchema,
  updateHotelSchema,
  type CreateBranchDto,
  type CreateHotelDto,
  type UpdateHotelDto,
} from './dto.js';
import { HotelService } from './hotel.service.js';

interface AuthenticatedRequest {
  principal?: Principal;
}

@ApiTags('Hotels')
@Controller({ path: 'hotels', version: '1' })
export class HotelController {
  constructor(private readonly hotels: HotelService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List published properties.' })
  list(@Query() query: Record<string, string>) {
    return this.hotels.list(listHotelsQuerySchema.parse(query));
  }

  @Get('manage')
  // Staff only. ROOM_READ is deliberately granted to guests so they can
  // browse room types, so it cannot gate an operational view that exposes
  // status notes, block reasons and status history.
  @RequireRoles(...STAFF_ROLES)
  @RequirePermissions(Permission.ROOM_READ)
  @ApiOperation({ summary: 'List every property, including drafts and suspended ones.' })
  listForStaff(@Query() query: Record<string, string>) {
    return this.hotels.list(listHotelsQuerySchema.parse(query), true);
  }

  @Public()
  @Get('by-slug/:slug')
  @ApiOperation({ summary: 'Fetch a published property by its web address.' })
  @ApiResponse({ status: 404, description: 'No published property has that address.' })
  findBySlug(@Param('slug') slug: string) {
    return this.hotels.findBySlug(slug);
  }

  @Get(':id')
  // Staff only. ROOM_READ is deliberately granted to guests so they can
  // browse room types, so it cannot gate an operational view that exposes
  // status notes, block reasons and status history.
  @RequireRoles(...STAFF_ROLES)
  @RequirePermissions(Permission.ROOM_READ)
  @ApiOperation({ summary: 'Fetch a property with its branches and images.' })
  findOne(@Param('id') id: string) {
    return this.hotels.findById(id);
  }

  @Post()
  @RequireRoles(Role.SUPER_ADMIN, Role.HOTEL_ADMIN)
  @ApiOperation({ summary: 'Create a property in DRAFT.' })
  @ApiResponse({ status: 409, description: 'The derived web address is already taken.' })
  create(@Body(zodBody(createHotelSchema)) dto: CreateHotelDto, @Req() req: AuthenticatedRequest) {
    return this.hotels.create(dto, principal(req).id);
  }

  @Patch(':id')
  @RequireRoles(Role.SUPER_ADMIN, Role.HOTEL_ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Update a property. An amenity list replaces the existing set.' })
  update(@Param('id') id: string, @Body(zodBody(updateHotelSchema)) dto: UpdateHotelDto) {
    return this.hotels.update(id, dto);
  }

  @Post(':id/publish')
  @HttpCode(200)
  @RequireRoles(Role.SUPER_ADMIN, Role.HOTEL_ADMIN)
  @ApiOperation({ summary: 'Make a property bookable and announce it to the platform.' })
  @ApiResponse({ status: 409, description: 'Already published, or closed.' })
  publish(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.hotels.publish(id, principal(req).id);
  }

  @Post(':id/branches')
  @RequireRoles(Role.SUPER_ADMIN, Role.HOTEL_ADMIN)
  @ApiOperation({ summary: 'Add a branch to a property.' })
  addBranch(@Param('id') id: string, @Body(zodBody(createBranchSchema)) dto: CreateBranchDto) {
    return this.hotels.addBranch(id, dto);
  }
}

function principal(req: AuthenticatedRequest): Principal {
  if (!req.principal) {
    throw new DomainError(ErrorCode.UNAUTHENTICATED, 'Authentication is required.');
  }
  return req.principal;
}
