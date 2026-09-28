import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DomainError, ErrorCode, Role } from '@staysphere/contracts';
import { Public, RequireRoles, zodBody, type Principal } from '@staysphere/service-core';
import {
  createReviewSchema,
  listReviewsQuerySchema,
  moderateReviewSchema,
  respondSchema,
  type CreateReviewDto,
  type ModerateReviewDto,
  type RespondDto,
} from './dto.js';
import { ReviewService } from './review.service.js';

interface AuthenticatedRequest {
  principal?: Principal;
}

@ApiTags('Reviews')
@Controller({ path: 'reviews', version: '1' })
export class ReviewController {
  constructor(private readonly reviews: ReviewService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Published reviews for a property.' })
  list(@Query() query: Record<string, string>) {
    return this.reviews.list(listReviewsQuerySchema.parse(query));
  }

  @Public()
  @Get('rating')
  @ApiOperation({ summary: 'A property’s aggregate rating and star distribution.' })
  rating(@Query('hotelId') hotelId: string) {
    if (!hotelId) throw DomainError.validation('hotelId is required.');
    return this.reviews.rating(hotelId);
  }

  @Get('moderation-queue')
  @RequireRoles(Role.SUPER_ADMIN, Role.HOTEL_ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Reviews held for a moderator.' })
  queue(@Query() query: Record<string, string>) {
    return this.reviews.list(
      listReviewsQuerySchema.parse({ ...query, status: 'PENDING_MODERATION' }),
      true,
    );
  }

  @Get('mine')
  @ApiOperation({ summary: 'The signed-in guest’s own reviews, whatever their status.' })
  mine(@Query() query: Record<string, string>, @Req() req: AuthenticatedRequest) {
    return this.reviews.list(
      listReviewsQuerySchema.parse({ ...query, customerId: principal(req).id }),
      true,
    );
  }

  @Post()
  @ApiOperation({ summary: 'Review a completed stay. One review per stay.' })
  @ApiResponse({ status: 409, description: 'This stay has already been reviewed.' })
  create(
    @Body(zodBody(createReviewSchema)) dto: CreateReviewDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.reviews.create(dto, principal(req).id);
  }

  @Post(':id/moderate')
  @HttpCode(200)
  @RequireRoles(Role.SUPER_ADMIN, Role.HOTEL_ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Publish, reject or hide a review.' })
  moderate(
    @Param('id') id: string,
    @Body(zodBody(moderateReviewSchema)) dto: ModerateReviewDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.reviews.moderateReview(id, dto, principal(req).id);
  }

  @Post(':id/response')
  @HttpCode(200)
  @RequireRoles(Role.SUPER_ADMIN, Role.HOTEL_ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Publish the property’s reply to a review.' })
  respond(
    @Param('id') id: string,
    @Body(zodBody(respondSchema)) dto: RespondDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.reviews.respond(id, dto, principal(req).id);
  }
}

function principal(req: AuthenticatedRequest): Principal {
  if (!req.principal) {
    throw new DomainError(ErrorCode.UNAUTHENTICATED, 'Authentication is required.');
  }
  return req.principal;
}
