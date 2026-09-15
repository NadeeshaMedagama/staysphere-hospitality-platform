import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  DEFAULT_TAX_COMPONENTS,
  DomainError,
  EventType,
  Topic,
  buildEvent,
  type TaxComponent,
} from '@staysphere/contracts';
import { nanoid } from 'nanoid';
import type { FinanceEnv } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  CreateInvoiceDto,
  ListInvoicesQuery,
  RecordPaymentDto,
  VoidInvoiceDto,
} from './dto.js';
import { derivePrefix, formatInvoiceNumber } from './invoice-number.js';
import { computeInvoiceTotals } from './tax.js';

export const FINANCE_ENV = Symbol('FINANCE_ENV');
export const CLOCK = Symbol('CLOCK');

export interface Clock {
  now(): Date;
}

@Injectable()
export class FinanceService {
  private readonly logger = new Logger(FinanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(FINANCE_ENV) private readonly env: FinanceEnv,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Issues an invoice for a closed stay.
   *
   * The invoice number is allocated from a per-property, per-year counter row
   * inside the same transaction as the invoice itself. A database sequence would
   * leave gaps on rollback; most tax authorities require the numbering to be
   * gap-free, so the counter has to move with the invoice or not at all.
   */
  async issue(dto: CreateInvoiceDto) {
    const existing = await this.prisma.invoice.findUnique({ where: { stayId: dto.stayId } });
    if (existing) {
      throw DomainError.conflict('An invoice has already been issued for this stay.', {
        invoiceId: existing.id,
        invoiceNumber: existing.invoiceNumber,
      });
    }

    const now = this.clock.now();
    const year = now.getUTCFullYear();
    const components: readonly TaxComponent[] =
      (dto.taxComponents as TaxComponent[] | undefined) ?? DEFAULT_TAX_COMPONENTS;

    const lines = dto.lines.map((line, index) => ({
      ...line,
      amountMinor: line.unitPriceMinor * line.quantity,
      sortOrder: index,
    }));

    const totals = computeInvoiceTotals(lines, dto.discountMinor, components, dto.currency);

    const invoice = await this.prisma.$transaction(async (tx) => {
      const counter = await tx.invoiceCounter.upsert({
        where: { hotelId_year: { hotelId: dto.hotelId, year } },
        create: {
          hotelId: dto.hotelId,
          year,
          prefix: derivePrefix(dto.hotelName),
          next: 2,
        },
        update: { next: { increment: 1 } },
      });

      // upsert returns the row *after* the increment, so the number just
      // allocated is one below the new value.
      const sequence = counter.next - 1;
      const invoiceNumber = formatInvoiceNumber(counter.prefix, year, sequence);

      const status =
        dto.paidMinor >= totals.total.amountMinor
          ? 'PAID'
          : dto.paidMinor > 0
            ? 'PARTIALLY_PAID'
            : 'ISSUED';

      const created = await tx.invoice.create({
        data: {
          invoiceNumber,
          hotelId: dto.hotelId,
          stayId: dto.stayId,
          bookingId: dto.bookingId,
          customerId: dto.customerId,
          billToName: dto.billToName,
          billToEmail: dto.billToEmail,
          billToAddress: dto.billToAddress ?? null,
          taxNumber: dto.taxNumber ?? null,
          status,
          currency: dto.currency,
          subtotalMinor: totals.subtotal.amountMinor,
          discountMinor: totals.discount.amountMinor,
          taxMinor: totals.tax.amountMinor,
          totalMinor: totals.total.amountMinor,
          paidMinor: dto.paidMinor,
          issuedAt: now,
          dueAt: new Date(now.getTime() + dto.dueInDays * 86_400_000),
          paidAt: status === 'PAID' ? now : null,
          lines: {
            create: lines.map((line) => ({
              description: line.description,
              quantity: line.quantity,
              unitPriceMinor: line.unitPriceMinor,
              amountMinor: line.amountMinor,
              taxable: line.taxable,
              sortOrder: line.sortOrder,
            })),
          },
          taxLines: {
            create: totals.taxLines.map((taxLine) => ({
              code: taxLine.code,
              label: taxLine.label,
              basisPoints: taxLine.basisPoints,
              baseMinor: taxLine.base.amountMinor,
              amountMinor: taxLine.amount.amountMinor,
            })),
          },
        },
        include: { lines: { orderBy: { sortOrder: 'asc' } }, taxLines: true },
      });

      const event = buildEvent({
        eventId: `evt_${nanoid(20)}`,
        type: EventType.INVOICE_ISSUED,
        version: 1,
        source: this.env.SERVICE_NAME,
        correlationId: `inv_${nanoid(16)}`,
        occurredAt: now,
        hotelId: dto.hotelId,
        payload: {
          invoiceId: created.id,
          invoiceNumber: created.invoiceNumber,
          stayId: created.stayId,
          bookingId: created.bookingId,
          hotelId: created.hotelId,
          customerId: created.customerId,
          subtotal: { amountMinor: created.subtotalMinor, currency: created.currency },
          tax: { amountMinor: created.taxMinor, currency: created.currency },
          total: { amountMinor: created.totalMinor, currency: created.currency },
          balanceDue: {
            amountMinor: created.totalMinor - created.paidMinor,
            currency: created.currency,
          },
          issuedAt: now.toISOString(),
        },
      });

      await tx.outboxEvent.create({
        data: {
          topic: Topic.FINANCE,
          partitionKey: dto.hotelId,
          eventType: event.type,
          payload: event as unknown as object,
        },
      });

      return created;
    });

    this.logger.log(
      {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        totalMinor: invoice.totalMinor,
      },
      'Invoice issued',
    );
    return invoice;
  }

  async recordPayment(invoiceId: string, dto: RecordPaymentDto) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw DomainError.notFound('Invoice', invoiceId);
    if (invoice.status === 'VOID') {
      throw DomainError.conflict('A voided invoice cannot receive a payment.');
    }

    const paidMinor = invoice.paidMinor + dto.amountMinor;
    if (paidMinor > invoice.totalMinor) {
      throw DomainError.validation('The payment exceeds the outstanding balance.', {
        outstandingMinor: invoice.totalMinor - invoice.paidMinor,
        requestedMinor: dto.amountMinor,
      });
    }

    const now = this.clock.now();
    const settled = paidMinor >= invoice.totalMinor;

    return this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        paidMinor,
        status: settled ? 'PAID' : 'PARTIALLY_PAID',
        paidAt: settled ? now : null,
      },
    });
  }

  /**
   * Voids an invoice.
   *
   * The row is kept and marked VOID rather than deleted: the number was already
   * issued, and deleting it would put a gap in a sequence that must not have one.
   */
  async void(invoiceId: string, dto: VoidInvoiceDto) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw DomainError.notFound('Invoice', invoiceId);
    if (invoice.status === 'VOID') {
      throw DomainError.conflict('This invoice is already void.');
    }
    if (invoice.paidMinor > 0) {
      throw DomainError.conflict('Refund the payment before voiding this invoice.', {
        paidMinor: invoice.paidMinor,
      });
    }

    return this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: 'VOID', voidedAt: this.clock.now(), voidReason: dto.reason },
    });
  }

  async findById(invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { lines: { orderBy: { sortOrder: 'asc' } }, taxLines: true },
    });
    if (!invoice) throw DomainError.notFound('Invoice', invoiceId);
    return {
      ...invoice,
      balanceDueMinor: invoice.totalMinor - invoice.paidMinor,
    };
  }

  async list(query: ListInvoicesQuery) {
    const where = {
      ...(query.hotelId ? { hotelId: query.hotelId } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to
        ? {
            issuedAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [items, totalItems] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        orderBy: { issuedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.invoice.count({ where }),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalItems / query.pageSize));
    return {
      data: items,
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
        totalPages,
        hasNextPage: query.page < totalPages,
      },
    };
  }

  /** Revenue and settlement totals for a period — the finance dashboard's source. */
  async revenueSummary(hotelId: string, from: Date, to: Date) {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        hotelId,
        status: { not: 'VOID' },
        issuedAt: { gte: from, lte: to },
      },
      select: {
        currency: true,
        subtotalMinor: true,
        discountMinor: true,
        taxMinor: true,
        totalMinor: true,
        paidMinor: true,
        refundedMinor: true,
      },
    });

    const totals = invoices.reduce(
      (acc, invoice) => ({
        invoices: acc.invoices + 1,
        subtotalMinor: acc.subtotalMinor + invoice.subtotalMinor,
        discountMinor: acc.discountMinor + invoice.discountMinor,
        taxMinor: acc.taxMinor + invoice.taxMinor,
        totalMinor: acc.totalMinor + invoice.totalMinor,
        paidMinor: acc.paidMinor + invoice.paidMinor,
        refundedMinor: acc.refundedMinor + invoice.refundedMinor,
      }),
      {
        invoices: 0,
        subtotalMinor: 0,
        discountMinor: 0,
        taxMinor: 0,
        totalMinor: 0,
        paidMinor: 0,
        refundedMinor: 0,
      },
    );

    return {
      ...totals,
      outstandingMinor: totals.totalMinor - totals.paidMinor,
      currency: invoices[0]?.currency ?? 'USD',
      from: from.toISOString(),
      to: to.toISOString(),
    };
  }
}
