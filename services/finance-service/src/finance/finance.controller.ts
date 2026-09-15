import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DomainError, ErrorCode, Permission } from '@staysphere/contracts';
import { RequirePermissions, zodBody, type Principal } from '@staysphere/service-core';
import {
  createInvoiceSchema,
  listInvoicesQuerySchema,
  recordPaymentSchema,
  voidInvoiceSchema,
  type CreateInvoiceDto,
  type RecordPaymentDto,
  type VoidInvoiceDto,
} from './dto.js';
import { FinanceService } from './finance.service.js';

interface AuthenticatedRequest {
  principal?: Principal;
}

@ApiTags('Invoices')
@Controller({ path: 'invoices', version: '1' })
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Post()
  @RequirePermissions(Permission.PAYMENT_READ)
  @ApiOperation({ summary: 'Issue an invoice for a closed stay.' })
  @ApiResponse({ status: 409, description: 'An invoice already exists for this stay.' })
  issue(@Body(zodBody(createInvoiceSchema)) dto: CreateInvoiceDto) {
    return this.finance.issue(dto);
  }

  @Get()
  @RequirePermissions(Permission.PAYMENT_READ)
  @ApiOperation({ summary: 'List invoices with filtering and pagination.' })
  list(@Query() query: Record<string, string>, @Req() req: AuthenticatedRequest) {
    const parsed = listInvoicesQuerySchema.parse(query);
    const actor = principal(req);
    const scoped = actor.roles.includes('CUSTOMER') ? { ...parsed, customerId: actor.id } : parsed;
    return this.finance.list(scoped);
  }

  @Get('revenue')
  @RequirePermissions(Permission.REPORT_READ)
  @ApiOperation({ summary: 'Revenue and settlement totals for a period.' })
  revenue(@Query('hotelId') hotelId: string, @Query('from') from: string, @Query('to') to: string) {
    if (!hotelId) throw DomainError.validation('hotelId is required.');
    const fromDate = from ? new Date(from) : startOfMonth(new Date());
    const toDate = to ? new Date(to) : new Date();
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      throw DomainError.validation('from and to must be valid ISO-8601 timestamps.');
    }
    return this.finance.revenueSummary(hotelId, fromDate, toDate);
  }

  @Get(':id')
  @RequirePermissions(Permission.PAYMENT_READ)
  @ApiOperation({ summary: 'Fetch an invoice with its lines and tax breakdown.' })
  findOne(@Param('id') id: string) {
    return this.finance.findById(id);
  }

  @Post(':id/payments')
  @HttpCode(200)
  @RequirePermissions(Permission.PAYMENT_READ)
  @ApiOperation({ summary: 'Record a payment against an invoice.' })
  recordPayment(
    @Param('id') id: string,
    @Body(zodBody(recordPaymentSchema)) dto: RecordPaymentDto,
  ) {
    return this.finance.recordPayment(id, dto);
  }

  @Post(':id/void')
  @HttpCode(200)
  @RequirePermissions(Permission.PAYMENT_REFUND)
  @ApiOperation({
    summary: 'Void an invoice. The record is retained so the numbering stays gap-free.',
  })
  @ApiResponse({ status: 409, description: 'Already void, or the invoice has been paid.' })
  voidInvoice(@Param('id') id: string, @Body(zodBody(voidInvoiceSchema)) dto: VoidInvoiceDto) {
    return this.finance.void(id, dto);
  }
}

function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function principal(req: AuthenticatedRequest): Principal {
  if (!req.principal) {
    throw new DomainError(ErrorCode.UNAUTHENTICATED, 'Authentication is required.');
  }
  return req.principal;
}
