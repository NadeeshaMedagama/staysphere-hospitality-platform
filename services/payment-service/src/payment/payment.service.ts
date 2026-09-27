import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  DomainError,
  ErrorCode,
  EventType,
  PaymentStatus,
  Topic,
  buildEvent,
  money,
} from '@staysphere/contracts';
import { nanoid } from 'nanoid';
import type { PaymentEnv } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  CapturePaymentDto,
  CreatePaymentDto,
  ListPaymentsQuery,
  RefundPaymentDto,
} from './dto.js';
import { assertPaymentTransition } from './payment-state.js';
import { GatewayRegistry } from './provider.js';
import { assessRefund, refundableAmount, type RefundablePayment } from './refund.js';

export const PAYMENT_ENV = Symbol('PAYMENT_ENV');
export const CLOCK = Symbol('CLOCK');

export interface Clock {
  now(): Date;
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateways: GatewayRegistry,
    @Inject(PAYMENT_ENV) private readonly env: PaymentEnv,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Takes a payment.
   *
   * The idempotency key is checked first and stored on the row under a unique
   * index, so a retried request — a flaky network, an impatient guest clicking
   * twice — returns the original payment instead of charging again.
   */
  async create(dto: CreatePaymentDto, customerId: string, idempotencyKey: string) {
    const existing = await this.prisma.payment.findUnique({ where: { idempotencyKey } });
    if (existing) {
      this.logger.log({ idempotencyKey, paymentId: existing.id }, 'Replayed payment request');
      return existing;
    }

    const gateway = this.gateways.get(dto.provider);
    const amount = money(dto.amountMinor, dto.currency);
    const now = this.clock.now();

    let charge;
    try {
      charge = await gateway.charge({
        amount,
        description: dto.description,
        customerReference: customerId,
        ...(dto.paymentToken ? { paymentToken: dto.paymentToken } : {}),
        idempotencyKey,
        capture: dto.captureImmediately,
      });
    } catch (error) {
      // A failed attempt is still recorded: the guest needs to see it, and
      // finance needs the trail when the provider later reports it settled.
      const failed = await this.prisma.payment.create({
        data: {
          bookingId: dto.bookingId,
          hotelId: dto.hotelId,
          stayId: dto.stayId ?? null,
          customerId,
          amountMinor: dto.amountMinor,
          currency: dto.currency,
          provider: dto.provider,
          method: dto.method,
          idempotencyKey,
          status: PaymentStatus.FAILED,
          failureCode: 'GATEWAY_ERROR',
          failureMessage: error instanceof Error ? error.message : 'Unknown gateway failure',
          retriable: true,
          failedAt: now,
        },
      });
      await this.publishPaymentFailed(failed);
      throw new DomainError(ErrorCode.PAYMENT_DECLINED, 'The payment could not be processed.', {
        details: { paymentId: failed.id, retriable: true },
        cause: error,
      });
    }

    const status = charge.captured
      ? PaymentStatus.COMPLETED
      : charge.authorized
        ? PaymentStatus.AUTHORIZED
        : PaymentStatus.FAILED;

    const payment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          bookingId: dto.bookingId,
          hotelId: dto.hotelId,
          stayId: dto.stayId ?? null,
          customerId,
          amountMinor: dto.amountMinor,
          capturedMinor: charge.captured ? dto.amountMinor : 0,
          currency: dto.currency,
          provider: dto.provider,
          method: dto.method,
          providerReference: charge.providerReference,
          cardLast4: charge.cardLast4 ?? null,
          cardBrand: charge.cardBrand ?? null,
          idempotencyKey,
          status,
          authorizedAt: charge.authorized ? now : null,
          capturedAt: charge.captured ? now : null,
        },
      });

      const event = buildEvent({
        eventId: `evt_${nanoid(20)}`,
        type: charge.captured ? EventType.PAYMENT_COMPLETED : EventType.PAYMENT_INITIATED,
        version: 1,
        source: this.env.SERVICE_NAME,
        correlationId: `pay_${nanoid(16)}`,
        occurredAt: now,
        hotelId: dto.hotelId,
        actor: { id: customerId, type: 'USER' },
        payload: charge.captured
          ? {
              paymentId: created.id,
              bookingId: created.bookingId,
              customerId,
              amount: { amountMinor: created.amountMinor, currency: created.currency },
              provider: created.provider,
              providerReference: charge.providerReference,
              status: created.status,
            }
          : {
              paymentId: created.id,
              bookingId: created.bookingId,
              customerId,
              amount: { amountMinor: created.amountMinor, currency: created.currency },
              provider: created.provider,
              idempotencyKey,
            },
      });

      await tx.outboxEvent.create({
        data: {
          topic: Topic.PAYMENT,
          partitionKey: dto.hotelId,
          eventType: event.type,
          payload: event as unknown as object,
        },
      });

      return created;
    });

    this.logger.log({ paymentId: payment.id, status }, 'Payment recorded');
    return payment;
  }

  /** Settles a hold, in full or in part. Used at check-in. */
  async capture(paymentId: string, dto: CapturePaymentDto) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw DomainError.notFound('Payment', paymentId);

    assertPaymentTransition(payment.status as PaymentStatus, PaymentStatus.COMPLETED);

    const captureMinor = dto.amountMinor ?? payment.amountMinor;
    if (captureMinor > payment.amountMinor) {
      throw DomainError.validation('A capture cannot exceed the authorised amount.', {
        authorisedMinor: payment.amountMinor,
        requestedMinor: captureMinor,
      });
    }

    const now = this.clock.now();

    return this.prisma.$transaction(async (tx) => {
      const captured = await tx.payment.update({
        where: { id: paymentId },
        data: { status: PaymentStatus.COMPLETED, capturedMinor: captureMinor, capturedAt: now },
      });

      const event = buildEvent({
        eventId: `evt_${nanoid(20)}`,
        type: EventType.PAYMENT_COMPLETED,
        version: 1,
        source: this.env.SERVICE_NAME,
        correlationId: `cap_${nanoid(16)}`,
        occurredAt: now,
        hotelId: payment.hotelId,
        payload: {
          paymentId: captured.id,
          bookingId: captured.bookingId,
          customerId: captured.customerId,
          amount: { amountMinor: captureMinor, currency: captured.currency },
          provider: captured.provider,
          providerReference: captured.providerReference ?? '',
          status: captured.status,
        },
      });

      await tx.outboxEvent.create({
        data: {
          topic: Topic.PAYMENT,
          partitionKey: payment.hotelId,
          eventType: event.type,
          payload: event as unknown as object,
        },
      });

      return captured;
    });
  }

  /**
   * Returns money to the guest.
   *
   * The cap is enforced by `assessRefund` against the amount captured minus what
   * has already been returned, so repeated partial refunds can never exceed the
   * original charge.
   */
  async refund(paymentId: string, dto: RefundPaymentDto, actorId: string, idempotencyKey: string) {
    const duplicate = await this.prisma.refund.findUnique({ where: { idempotencyKey } });
    if (duplicate) return duplicate;

    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw DomainError.notFound('Payment', paymentId);

    const outcome = assessRefund(
      payment as unknown as RefundablePayment,
      money(dto.amountMinor, payment.currency),
    );

    const gateway = this.gateways.get(payment.provider);
    const providerRefund = await gateway.refund({
      providerReference: payment.providerReference ?? '',
      amount: outcome.amount,
      reason: dto.reason,
      idempotencyKey,
    });

    const now = this.clock.now();

    return this.prisma.$transaction(async (tx) => {
      const refund = await tx.refund.create({
        data: {
          paymentId,
          amountMinor: outcome.amount.amountMinor,
          currency: payment.currency,
          reason: dto.reason,
          notes: dto.notes ?? null,
          providerReference: providerRefund.providerReference,
          idempotencyKey,
          issuedById: actorId,
        },
      });

      await tx.payment.update({
        where: { id: paymentId },
        data: { refundedMinor: outcome.totalRefundedMinor, status: outcome.nextStatus },
      });

      const event = buildEvent({
        eventId: `evt_${nanoid(20)}`,
        type: EventType.PAYMENT_REFUNDED,
        version: 1,
        source: this.env.SERVICE_NAME,
        correlationId: `rfd_${nanoid(16)}`,
        occurredAt: now,
        hotelId: payment.hotelId,
        actor: { id: actorId, type: 'STAFF' },
        payload: {
          refundId: refund.id,
          paymentId,
          bookingId: payment.bookingId,
          amount: {
            amountMinor: outcome.amount.amountMinor,
            currency: outcome.amount.currency,
          },
          reason: dto.reason,
          partial: outcome.partial,
        },
      });

      await tx.outboxEvent.create({
        data: {
          topic: Topic.PAYMENT,
          partitionKey: payment.hotelId,
          eventType: event.type,
          payload: event as unknown as object,
        },
      });

      this.logger.log(
        { paymentId, refundId: refund.id, amountMinor: outcome.amount.amountMinor },
        'Refund issued',
      );
      return refund;
    });
  }

  async findById(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { refunds: { orderBy: { createdAt: 'desc' } } },
    });
    if (!payment) throw DomainError.notFound('Payment', paymentId);
    return {
      ...payment,
      refundable: refundableAmount(payment as unknown as RefundablePayment),
    };
  }

  async list(query: ListPaymentsQuery) {
    const where = {
      ...(query.bookingId ? { bookingId: query.bookingId } : {}),
      ...(query.hotelId ? { hotelId: query.hotelId } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, totalItems] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.payment.count({ where }),
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

  private async publishPaymentFailed(payment: {
    id: string;
    bookingId: string;
    hotelId: string;
    amountMinor: number;
    currency: string;
    failureCode: string | null;
    failureMessage: string | null;
    retriable: boolean;
  }): Promise<void> {
    const event = buildEvent({
      eventId: `evt_${nanoid(20)}`,
      type: EventType.PAYMENT_FAILED,
      version: 1,
      source: this.env.SERVICE_NAME,
      correlationId: `pfl_${nanoid(16)}`,
      occurredAt: this.clock.now(),
      hotelId: payment.hotelId,
      payload: {
        paymentId: payment.id,
        bookingId: payment.bookingId,
        amount: { amountMinor: payment.amountMinor, currency: payment.currency },
        failureCode: payment.failureCode ?? 'UNKNOWN',
        failureMessage: payment.failureMessage ?? 'The payment could not be processed.',
        retriable: payment.retriable,
      },
    });

    await this.prisma.outboxEvent.create({
      data: {
        topic: Topic.PAYMENT,
        partitionKey: payment.hotelId,
        eventType: event.type,
        payload: event as unknown as object,
      },
    });
  }
}
