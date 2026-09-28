import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
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
  createPromotionSchema,
  createRatePlanSchema,
  quoteRequestSchema,
  validatePromotionSchema,
  type CreatePromotionDto,
  type CreateRatePlanDto,
  type ValidatePromotionDto,
} from './dto.js';
import { PricingService } from './pricing.service.js';

interface AuthenticatedRequest {
  principal?: Principal;
}

@ApiTags('Pricing')
@Controller({ path: 'rates', version: '1' })
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  @Public()
  @Get('quote')
  @ApiOperation({ summary: 'A demand-adjusted nightly rate for a room type.' })
  @ApiResponse({ status: 404, description: 'No published rate plan covers this date.' })
  quote(@Query() query: Record<string, string>) {
    return this.pricing.quoteNightlyRate(quoteRequestSchema.parse(query));
  }

  @Get('plans/:hotelId/:roomTypeId')
  // Staff only. ROOM_READ is deliberately granted to guests so they can
  // browse room types, so it cannot gate an operational view that exposes
  // status notes, block reasons and status history.
  @RequireRoles(...STAFF_ROLES)
  @RequirePermissions(Permission.ROOM_READ)
  @ApiOperation({ summary: 'The rate plan currently in force for a room type.' })
  activePlan(@Param('hotelId') hotelId: string, @Param('roomTypeId') roomTypeId: string) {
    return this.pricing.activeRatePlan(hotelId, roomTypeId);
  }

  @Post('plans')
  @RequirePermissions(Permission.RATE_WRITE)
  @ApiOperation({ summary: 'Create a rate plan with its seasons and long-stay tiers.' })
  createPlan(@Body(zodBody(createRatePlanSchema)) dto: CreateRatePlanDto) {
    return this.pricing.createRatePlan(dto);
  }

  @Post('plans/:id/publish')
  @HttpCode(200)
  @RequirePermissions(Permission.RATE_WRITE)
  @ApiOperation({ summary: 'Publish a rate plan and announce it to booking.' })
  publishPlan(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.pricing.publishRatePlan(id, principal(req).id);
  }

  @Post('promotions')
  @RequirePermissions(Permission.RATE_WRITE)
  @ApiOperation({ summary: 'Create a promotion code.' })
  @ApiResponse({ status: 409, description: 'That code already exists.' })
  createPromotion(@Body(zodBody(createPromotionSchema)) dto: CreatePromotionDto) {
    return this.pricing.createPromotion(dto);
  }

  @Post('promotions/validate')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Check a promotion code against a booking without consuming it.',
  })
  validatePromotion(
    @Body(zodBody(validatePromotionSchema)) dto: ValidatePromotionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.pricing.validatePromotion(dto, principal(req).id);
  }
}

function principal(req: AuthenticatedRequest): Principal {
  if (!req.principal) {
    throw new DomainError(ErrorCode.UNAUTHENTICATED, 'Authentication is required.');
  }
  return req.principal;
}
