import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DomainError, ErrorCode, Permission } from '@staysphere/contracts';
import { RequirePermissions, zodBody, type Principal } from '@staysphere/service-core';
import {
  checkInSchema,
  checkOutSchema,
  listStaysQuerySchema,
  postChargeSchema,
  requestServiceSchema,
  type CheckInDto,
  type CheckOutDto,
  type PostChargeDto,
  type RequestServiceDto,
} from './dto.js';
import { StayService } from './stay.service.js';

interface AuthenticatedRequest {
  principal?: Principal;
}

@ApiTags('Stays')
@Controller({ path: 'stays', version: '1' })
export class StayController {
  constructor(private readonly stays: StayService) {}

  @Post('check-in')
  @RequirePermissions(Permission.BOOKING_WRITE)
  @ApiOperation({ summary: 'Check a guest in and open their folio.' })
  @ApiResponse({ status: 409, description: 'The reservation is already checked in.' })
  checkIn(@Body(zodBody(checkInSchema)) dto: CheckInDto, @Req() req: AuthenticatedRequest) {
    return this.stays.checkIn(dto, principal(req).id);
  }

  @Post(':id/check-out')
  @HttpCode(200)
  @RequirePermissions(Permission.BOOKING_WRITE)
  @ApiOperation({ summary: 'Close a stay, settle the folio and release the room.' })
  @ApiResponse({
    status: 409,
    description: 'The folio is unsettled and departure was not authorised.',
  })
  checkOut(
    @Param('id') id: string,
    @Body(zodBody(checkOutSchema)) dto: CheckOutDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.stays.checkOut(id, dto, principal(req).id);
  }

  @Get('in-house')
  @RequirePermissions(Permission.BOOKING_READ)
  @ApiOperation({ summary: 'Everyone currently in the building.' })
  inHouse(@Query('hotelId') hotelId: string) {
    if (!hotelId) throw DomainError.validation('hotelId is required.');
    return this.stays.inHouse(hotelId);
  }

  @Get()
  @RequirePermissions(Permission.BOOKING_READ)
  @ApiOperation({ summary: 'List stays with filtering and pagination.' })
  list(@Query() query: Record<string, string>, @Req() req: AuthenticatedRequest) {
    const parsed = listStaysQuerySchema.parse(query);
    const actor = principal(req);
    const scoped = actor.roles.includes('CUSTOMER') ? { ...parsed, customerId: actor.id } : parsed;
    return this.stays.list(scoped);
  }

  @Get(':id/folio')
  @RequirePermissions(Permission.BOOKING_READ)
  @ApiOperation({ summary: 'The itemised bill and its running balance.' })
  folio(@Param('id') id: string) {
    return this.stays.folio(id);
  }

  @Post(':id/services')
  @RequirePermissions(Permission.BOOKING_WRITE)
  @ApiOperation({ summary: 'Request an extra and post it to the folio.' })
  @ApiResponse({ status: 404, description: 'The property does not offer that service.' })
  requestService(
    @Param('id') id: string,
    @Body(zodBody(requestServiceSchema)) dto: RequestServiceDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.stays.requestService(id, dto, principal(req).id);
  }

  @Post(':id/charges')
  @RequirePermissions(Permission.BOOKING_WRITE)
  @ApiOperation({
    summary: 'Post a manual charge, discount or correction. The folio is append-only.',
  })
  postCharge(
    @Param('id') id: string,
    @Body(zodBody(postChargeSchema)) dto: PostChargeDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.stays.postCharge(id, dto, principal(req).id);
  }
}

function principal(req: AuthenticatedRequest): Principal {
  if (!req.principal) {
    throw new DomainError(ErrorCode.UNAUTHENTICATED, 'Authentication is required.');
  }
  return req.principal;
}
