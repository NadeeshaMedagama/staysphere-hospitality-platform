import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DomainError, ErrorCode, Permission } from '@staysphere/contracts';
import { RequirePermissions, zodBody, type Principal } from '@staysphere/service-core';
import { nanoid } from 'nanoid';
import {
  capturePaymentSchema,
  createPaymentSchema,
  listPaymentsQuerySchema,
  refundPaymentSchema,
  type CapturePaymentDto,
  type CreatePaymentDto,
  type RefundPaymentDto,
} from './dto.js';
import { PaymentService } from './payment.service.js';

interface AuthenticatedRequest {
  principal?: Principal;
}

@ApiTags('Payments')
@Controller({ path: 'payments', version: '1' })
export class PaymentController {
  constructor(private readonly payments: PaymentService) {}

  @Post()
  @RequirePermissions(Permission.BOOKING_WRITE)
  @ApiOperation({ summary: 'Take a payment, or place a hold to capture at check-in.' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'A repeated key returns the original payment instead of charging again.',
  })
  @ApiResponse({ status: 402, description: 'The provider declined the payment.' })
  create(
    @Body(zodBody(createPaymentSchema)) dto: CreatePaymentDto,
    @Req() req: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    // A generated key still protects the transaction boundary; it just cannot
    // deduplicate a client retry, so the header is strongly encouraged.
    return this.payments.create(dto, principal(req).id, idempotencyKey ?? `gen_${nanoid(24)}`);
  }

  @Get()
  @RequirePermissions(Permission.PAYMENT_READ)
  @ApiOperation({ summary: 'List payments with filtering and pagination.' })
  list(@Query() query: Record<string, string>, @Req() req: AuthenticatedRequest) {
    const parsed = listPaymentsQuerySchema.parse(query);
    const actor = principal(req);
    // A guest sees only their own payments, whatever they ask for.
    const scoped = actor.roles.includes('CUSTOMER') ? { ...parsed, customerId: actor.id } : parsed;
    return this.payments.list(scoped);
  }

  @Get(':id')
  @RequirePermissions(Permission.PAYMENT_READ)
  @ApiOperation({ summary: 'Fetch a payment with its refunds and remaining refundable amount.' })
  findOne(@Param('id') id: string) {
    return this.payments.findById(id);
  }

  @Post(':id/capture')
  @HttpCode(200)
  @RequirePermissions(Permission.PAYMENT_READ)
  @ApiOperation({ summary: 'Settle a previously authorised hold.' })
  @ApiResponse({ status: 409, description: 'The payment is not in a capturable state.' })
  capture(@Param('id') id: string, @Body(zodBody(capturePaymentSchema)) dto: CapturePaymentDto) {
    return this.payments.capture(id, dto);
  }

  @Post(':id/refund')
  @HttpCode(201)
  @RequirePermissions(Permission.PAYMENT_REFUND)
  @ApiOperation({ summary: 'Return money to the guest, in full or in part.' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiResponse({ status: 409, description: 'The refund exceeds what remains on the payment.' })
  refund(
    @Param('id') id: string,
    @Body(zodBody(refundPaymentSchema)) dto: RefundPaymentDto,
    @Req() req: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.payments.refund(id, dto, principal(req).id, idempotencyKey ?? `gen_${nanoid(24)}`);
  }
}

function principal(req: AuthenticatedRequest): Principal {
  if (!req.principal) {
    throw new DomainError(ErrorCode.UNAUTHENTICATED, 'Authentication is required.');
  }
  return req.principal;
}
