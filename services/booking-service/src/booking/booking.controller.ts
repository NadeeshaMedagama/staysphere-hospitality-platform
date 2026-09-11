import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DomainError, ErrorCode, Permission } from '@staysphere/contracts';
import { Public, RequirePermissions, zodBody, type Principal } from '@staysphere/service-core';
import { BookingService } from './booking.service.js';
import {
  availabilityQuerySchema,
  cancelBookingSchema,
  createBookingSchema,
  listBookingsQuerySchema,
  type CancelBookingDto,
  type CreateBookingDto,
} from './dto.js';

interface AuthenticatedRequest {
  principal?: Principal;
}

@ApiTags('Bookings')
@Controller({ path: 'bookings', version: '1' })
export class BookingController {
  constructor(private readonly bookings: BookingService) {}

  @Public()
  @Get('availability')
  @ApiOperation({ summary: 'Check room availability and price a stay.' })
  @ApiResponse({ status: 200, description: 'Availability and an itemised quote.' })
  availability(@Query() query: Record<string, string>) {
    return this.bookings.checkAvailability(availabilityQuerySchema.parse(query));
  }

  @Post()
  @RequirePermissions(Permission.BOOKING_WRITE)
  @ApiOperation({ summary: 'Create a reservation and hold a room.' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Client-generated key; a retry with the same key will not double-book.',
  })
  @ApiResponse({ status: 409, description: 'Room type sold out, or the key was already used.' })
  create(
    @Body(zodBody(createBookingSchema)) dto: CreateBookingDto,
    @Req() req: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.bookings.create(dto, requirePrincipal(req).id, idempotencyKey);
  }

  @Get()
  @RequirePermissions(Permission.BOOKING_READ)
  @ApiOperation({ summary: 'List reservations with filtering and pagination.' })
  list(@Query() query: Record<string, string>, @Req() req: AuthenticatedRequest) {
    const parsed = listBookingsQuerySchema.parse(query);
    const principal = requirePrincipal(req);

    // A guest may only ever list their own reservations, whatever they ask for.
    const scoped = principal.roles.includes('CUSTOMER')
      ? { ...parsed, customerId: principal.id }
      : parsed;

    return this.bookings.list(scoped);
  }

  @Get(':id')
  @RequirePermissions(Permission.BOOKING_READ)
  @ApiOperation({ summary: 'Fetch one reservation with its nightly breakdown.' })
  async findOne(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const booking = await this.bookings.findById(id);
    const principal = requirePrincipal(req);

    if (principal.roles.includes('CUSTOMER') && booking.customerId !== principal.id) {
      // Deliberately NOT_FOUND rather than FORBIDDEN: a 403 would confirm that
      // this booking id exists, which is itself information the guest is not
      // entitled to.
      throw DomainError.notFound('Booking', id);
    }
    return booking;
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermissions(Permission.BOOKING_CANCEL)
  @ApiOperation({ summary: 'Cancel a reservation and assess the refund due.' })
  @ApiResponse({ status: 409, description: 'The booking is past the point of cancellation.' })
  cancel(
    @Param('id') id: string,
    @Body(zodBody(cancelBookingSchema)) dto: CancelBookingDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.bookings.cancel(id, requirePrincipal(req).id, dto);
  }
}

function requirePrincipal(req: AuthenticatedRequest): Principal {
  if (!req.principal) {
    throw new DomainError(ErrorCode.UNAUTHENTICATED, 'Authentication is required.');
  }
  return req.principal;
}
