import { Inject, Injectable, Logger } from '@nestjs/common';
import { DomainError, EventType, Topic, buildEvent, money } from '@staysphere/contracts';
import { nanoid } from 'nanoid';
import type { PricingEnv } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { applyDemandPricing } from './dynamic-rate.js';
import type {
  CreatePromotionDto,
  CreateRatePlanDto,
  QuoteRequestDto,
  ValidatePromotionDto,
} from './dto.js';
import { assessPromotion, type Promotion } from './promotion.js';

export const PRICING_ENV = Symbol('PRICING_ENV');
export const CLOCK = Symbol('CLOCK');

export interface Clock {
  now(): Date;
}

@Injectable()
export class PricingService {
  private readonly logger = new Logger(PricingService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PRICING_ENV) private readonly env: PricingEnv,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async createRatePlan(dto: CreateRatePlanDto) {
    if (dto.minRateMinor !== undefined && dto.maxRateMinor !== undefined) {
      if (dto.minRateMinor > dto.maxRateMinor) {
        throw DomainError.validation('minRateMinor cannot exceed maxRateMinor.', {
          minRateMinor: dto.minRateMinor,
          maxRateMinor: dto.maxRateMinor,
        });
      }
    }
    for (const season of dto.seasons) {
      if (season.endsOn < season.startsOn) {
        throw DomainError.validation(`Season '${season.label}' ends before it starts.`);
      }
    }

    const { seasons, longStayDiscounts, ...plan } = dto;

    return this.prisma.ratePlan.create({
      data: {
        ...plan,
        effectiveTo: plan.effectiveTo ?? null,
        minRateMinor: plan.minRateMinor ?? null,
        maxRateMinor: plan.maxRateMinor ?? null,
        seasons: { create: seasons },
        stayDiscounts: { create: longStayDiscounts },
      },
      include: { seasons: true, stayDiscounts: true },
    });
  }

  /**
   * Publishes a rate plan and announces it.
   *
   * Booking keeps a local projection of published rates, so the state change and
   * the event go out together — a plan can never be live without booking knowing.
   */
  async publishRatePlan(ratePlanId: string, actorId: string) {
    const plan = await this.prisma.ratePlan.findUnique({
      where: { id: ratePlanId },
      include: { seasons: true, stayDiscounts: true },
    });
    if (!plan) throw DomainError.notFound('RatePlan', ratePlanId);
    if (plan.published) throw DomainError.conflict('This rate plan is already published.');

    const now = this.clock.now();

    return this.prisma.$transaction(async (tx) => {
      const published = await tx.ratePlan.update({
        where: { id: ratePlanId },
        data: { published: true },
        include: { seasons: true, stayDiscounts: true },
      });

      const event = buildEvent({
        eventId: `evt_${nanoid(20)}`,
        type: EventType.RATE_PLAN_PUBLISHED,
        version: 1,
        source: this.env.SERVICE_NAME,
        correlationId: `rpl_${nanoid(16)}`,
        occurredAt: now,
        hotelId: plan.hotelId,
        actor: { id: actorId, type: 'STAFF' },
        payload: {
          ratePlanId: published.id,
          hotelId: published.hotelId,
          roomTypeId: published.roomTypeId,
          currency: published.currency,
          baseRateMinor: published.baseRateMinor,
          weekendMultiplier: Number(published.weekendMultiplier),
          taxBasisPoints: published.taxBasisPoints,
          effectiveFrom: published.effectiveFrom.toISOString(),
        },
      });

      await tx.outboxEvent.create({
        data: {
          topic: Topic.PRICING,
          partitionKey: plan.hotelId,
          eventType: event.type,
          payload: event as unknown as object,
        },
      });

      this.logger.log({ ratePlanId, actorId }, 'Rate plan published');
      return published;
    });
  }

  /** The rate plan in force for a room type on a given day. */
  async activeRatePlan(hotelId: string, roomTypeId: string, on: Date = this.clock.now()) {
    const plan = await this.prisma.ratePlan.findFirst({
      where: {
        hotelId,
        roomTypeId,
        published: true,
        effectiveFrom: { lte: on },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: on } }],
      },
      include: { seasons: true, stayDiscounts: true },
      // Most recently effective wins when windows overlap.
      orderBy: { effectiveFrom: 'desc' },
    });
    if (!plan) {
      throw DomainError.notFound('RatePlan', `${hotelId}/${roomTypeId}`);
    }
    return plan;
  }

  /** A demand-adjusted nightly rate, clamped to the plan's floor and ceiling. */
  async quoteNightlyRate(dto: QuoteRequestDto) {
    const plan = await this.activeRatePlan(dto.hotelId, dto.roomTypeId);
    const base = money(plan.baseRateMinor, plan.currency);

    const adjusted = applyDemandPricing(
      base,
      {
        occupancy: dto.occupancy,
        leadTimeDays: dto.leadTimeDays,
        highDemandDate: dto.highDemandDate,
      },
      { minRateMinor: plan.minRateMinor, maxRateMinor: plan.maxRateMinor },
    );

    return {
      ratePlanId: plan.id,
      currency: plan.currency,
      baseRate: base,
      nightlyRate: adjusted,
      taxBasisPoints: plan.taxBasisPoints,
      weekendMultiplier: Number(plan.weekendMultiplier),
      seasons: plan.seasons,
      longStayDiscounts: plan.stayDiscounts,
    };
  }

  async createPromotion(dto: CreatePromotionDto) {
    if (dto.type === 'PERCENTAGE' && dto.value > 9_000) {
      throw DomainError.validation('A percentage promotion cannot exceed 90%.', {
        value: dto.value,
      });
    }
    if (dto.type === 'FIXED_AMOUNT' && !dto.currency) {
      throw DomainError.validation('A fixed-amount promotion must state its currency.');
    }
    if (new Date(dto.validTo) <= new Date(dto.validFrom)) {
      throw DomainError.validation('validTo must be after validFrom.');
    }
    if (await this.prisma.promotion.findUnique({ where: { code: dto.code } })) {
      throw DomainError.conflict('That promotion code already exists.', { code: dto.code });
    }

    return this.prisma.promotion.create({
      data: {
        ...dto,
        hotelId: dto.hotelId ?? null,
        currency: dto.currency ?? null,
        description: dto.description ?? null,
        validFrom: new Date(dto.validFrom),
        validTo: new Date(dto.validTo),
      },
    });
  }

  /**
   * Checks a promotion code against a specific booking.
   *
   * Read-only: the redemption is recorded when the booking is actually paid,
   * not when the guest types the code, so an abandoned checkout does not consume
   * a limited promotion.
   */
  async validatePromotion(dto: ValidatePromotionDto, customerId: string) {
    const promotion = await this.prisma.promotion.findUnique({ where: { code: dto.code } });
    if (!promotion) {
      throw DomainError.notFound('Promotion', dto.code);
    }

    const customerRedemptions = await this.prisma.promotionRedemption.count({
      where: { promotionId: promotion.id, customerId },
    });

    const assessment = assessPromotion(promotion as unknown as Promotion, {
      now: this.clock.now(),
      hotelId: dto.hotelId,
      roomTypeId: dto.roomTypeId,
      nights: dto.nights,
      subtotal: money(dto.subtotalMinor, dto.currency),
      customerRedemptions,
    });

    return {
      code: promotion.code,
      name: promotion.name,
      applicable: assessment.applicable,
      ...(assessment.rejection ? { reason: assessment.rejection } : {}),
      discount: assessment.discount,
      exclusive: promotion.exclusive,
    };
  }

  /** Records a redemption once the booking is confirmed. Idempotent per booking. */
  async redeem(code: string, customerId: string, bookingId: string, amountMinor: number) {
    const promotion = await this.prisma.promotion.findUnique({ where: { code } });
    if (!promotion) throw DomainError.notFound('Promotion', code);

    const existing = await this.prisma.promotionRedemption.findUnique({
      where: { promotionId_bookingId: { promotionId: promotion.id, bookingId } },
    });
    if (existing) return existing;

    return this.prisma.$transaction(async (tx) => {
      const redemption = await tx.promotionRedemption.create({
        data: { promotionId: promotion.id, customerId, bookingId, amountMinor },
      });
      await tx.promotion.update({
        where: { id: promotion.id },
        data: { redemptionCount: { increment: 1 } },
      });
      return redemption;
    });
  }
}
