import { Module } from '@nestjs/common';
import { loadReviewEnv, type ReviewEnv } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ReviewController } from './review.controller.js';
import { CLOCK, REVIEW_ENV, ReviewService, type Clock } from './review.service.js';

const systemClock: Clock = { now: () => new Date() };

@Module({
  controllers: [ReviewController],
  providers: [
    PrismaService,
    ReviewService,
    { provide: REVIEW_ENV, useFactory: (): ReviewEnv => loadReviewEnv() },
    { provide: CLOCK, useValue: systemClock },
  ],
  exports: [ReviewService, PrismaService],
})
export class ReviewModule {}
