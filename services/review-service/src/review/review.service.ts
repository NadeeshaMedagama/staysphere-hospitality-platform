import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  DomainError,
  EventType,
  ReviewStatus,
  Topic,
  buildEvent,
  overallRating,
  type RatingCategory,
} from '@staysphere/contracts';
import { nanoid } from 'nanoid';
import type { ReviewEnv } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EMPTY_AGGREGATE, aggregateRatings, type ScoredReview } from './aggregation.js';
import type { CreateReviewDto, ListReviewsQuery, ModerateReviewDto, RespondDto } from './dto.js';
import { moderate } from './moderation.js';

export const REVIEW_ENV = Symbol('REVIEW_ENV');
export const CLOCK = Symbol('CLOCK');

export interface Clock {
  now(): Date;
}

@Injectable()
export class ReviewService {
  private readonly logger = new Logger(ReviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REVIEW_ENV) private readonly env: ReviewEnv,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Submits a review.
   *
   * One review per stay, enforced by a unique index. A review that does not
   * correspond to a stay is an opinion, not a review, and letting those in is
   * how a ratings page stops being worth reading.
   */
  async create(dto: CreateReviewDto, customerId: string) {
    const existing = await this.prisma.review.findUnique({ where: { stayId: dto.stayId } });
    if (existing) {
      throw DomainError.conflict('You have already reviewed this stay.', {
        reviewId: existing.id,
      });
    }

    const scores = dto.scores as Partial<Record<RatingCategory, number>>;
    const overall = overallRating(scores);

    const decision = moderate({
      title: dto.title ?? null,
      comment: dto.comment ?? null,
      displayName: dto.displayName,
    });

    const now = this.clock.now();

    const review = await this.prisma.$transaction(async (tx) => {
      const created = await tx.review.create({
        data: {
          hotelId: dto.hotelId,
          stayId: dto.stayId,
          bookingId: dto.bookingId,
          customerId,
          roomTypeId: dto.roomTypeId ?? null,
          displayName: dto.displayName,
          scores,
          overallRating: overall,
          title: dto.title ?? null,
          comment: dto.comment ?? null,
          photos: dto.photos,
          status: decision.status,
          moderationReason: decision.reason,
        },
      });

      if (decision.status === ReviewStatus.PUBLISHED) {
        await this.publishReviewEvent(tx, created, overall, scores, now);
      }

      return created;
    });

    if (review.status === ReviewStatus.PUBLISHED) {
      await this.recomputeRating(dto.hotelId);
    }

    this.logger.log(
      { reviewId: review.id, status: review.status, flags: decision.flags },
      'Review submitted',
    );
    return { review, moderation: decision };
  }

  /** A moderator's decision on a held review. */
  async moderateReview(reviewId: string, dto: ModerateReviewDto, moderatorId: string) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) throw DomainError.notFound('Review', reviewId);

    const now = this.clock.now();
    const wasPublished = review.status === ReviewStatus.PUBLISHED;

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.review.update({
        where: { id: reviewId },
        data: {
          status: dto.status,
          moderationReason: dto.reason ?? null,
          moderatedById: moderatorId,
          moderatedAt: now,
        },
      });

      if (dto.status === ReviewStatus.PUBLISHED && !wasPublished) {
        await this.publishReviewEvent(
          tx,
          result,
          Number(result.overallRating),
          result.scores as Partial<Record<RatingCategory, number>>,
          now,
        );
      }

      return result;
    });

    // The aggregate changes whenever a review enters or leaves publication.
    if (wasPublished !== (dto.status === ReviewStatus.PUBLISHED)) {
      await this.recomputeRating(review.hotelId);
    }

    return updated;
  }

  async respond(reviewId: string, dto: RespondDto, responderId: string) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) throw DomainError.notFound('Review', reviewId);
    if (review.status !== ReviewStatus.PUBLISHED) {
      throw DomainError.conflict('Only a published review can receive a public response.');
    }

    return this.prisma.review.update({
      where: { id: reviewId },
      data: { responseBody: dto.body, responseById: responderId, respondedAt: this.clock.now() },
    });
  }

  async list(query: ListReviewsQuery, includeUnpublished = false) {
    const where = {
      ...(query.hotelId ? { hotelId: query.hotelId } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(includeUnpublished
        ? query.status
          ? { status: query.status }
          : {}
        : { status: ReviewStatus.PUBLISHED }),
      ...(query.minRating ? { overallRating: { gte: query.minRating } } : {}),
    };

    const [items, totalItems] = await Promise.all([
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.review.count({ where }),
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

  /** The stored aggregate, so a public listing never aggregates on read. */
  async rating(hotelId: string) {
    const stored = await this.prisma.hotelRating.findUnique({ where: { hotelId } });
    if (!stored) return { hotelId, ...EMPTY_AGGREGATE };
    return {
      hotelId,
      reviewCount: stored.reviewCount,
      overallRating: Number(stored.overallRating),
      categoryAverages: stored.categoryAverages,
      distribution: stored.distribution,
    };
  }

  /** Full recompute. Cheap enough at this scale and always exactly right. */
  async recomputeRating(hotelId: string) {
    const published = await this.prisma.review.findMany({
      where: { hotelId, status: ReviewStatus.PUBLISHED },
      select: { overallRating: true, scores: true },
    });

    const aggregate = aggregateRatings(
      published.map((review): ScoredReview => ({
        overallRating: Number(review.overallRating),
        scores: review.scores as Partial<Record<RatingCategory, number>>,
      })),
    );

    return this.prisma.hotelRating.upsert({
      where: { hotelId },
      create: {
        hotelId,
        reviewCount: aggregate.reviewCount,
        overallRating: aggregate.overallRating,
        categoryAverages: aggregate.categoryAverages,
        distribution: aggregate.distribution,
      },
      update: {
        reviewCount: aggregate.reviewCount,
        overallRating: aggregate.overallRating,
        categoryAverages: aggregate.categoryAverages,
        distribution: aggregate.distribution,
      },
    });
  }

  private async publishReviewEvent(
    tx: { outboxEvent: { create(args: { data: object }): Promise<unknown> } },
    review: {
      id: string;
      hotelId: string;
      stayId: string;
      customerId: string;
      comment: string | null;
    },
    overall: number,
    scores: Partial<Record<RatingCategory, number>>,
    now: Date,
  ): Promise<void> {
    const event = buildEvent({
      eventId: `evt_${nanoid(20)}`,
      type: EventType.REVIEW_PUBLISHED,
      version: 1,
      source: this.env.SERVICE_NAME,
      correlationId: `rev_${nanoid(16)}`,
      occurredAt: now,
      hotelId: review.hotelId,
      payload: {
        reviewId: review.id,
        hotelId: review.hotelId,
        stayId: review.stayId,
        customerId: review.customerId,
        overallRating: overall,
        scores: scores as Record<string, number>,
        hasComment: Boolean(review.comment),
      },
    });

    await tx.outboxEvent.create({
      data: {
        topic: Topic.REVIEW,
        partitionKey: review.hotelId,
        eventType: event.type,
        payload: event as unknown as object,
      },
    });
  }
}
