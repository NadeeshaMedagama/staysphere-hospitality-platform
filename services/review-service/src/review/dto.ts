import { ALL_RATING_CATEGORIES, MAX_RATING, MIN_RATING } from '@staysphere/contracts';
import { z } from 'zod';

const score = z.number().int().min(MIN_RATING).max(MAX_RATING);

export const createReviewSchema = z.object({
  hotelId: z.string().min(1),
  stayId: z.string().min(1),
  bookingId: z.string().min(1),
  roomTypeId: z.string().optional(),
  displayName: z.string().trim().min(2).max(80),
  scores: z
    .object(
      Object.fromEntries(ALL_RATING_CATEGORIES.map((category) => [category, score.optional()])),
    )
    .refine(
      (value) => Object.values(value).some((entry) => typeof entry === 'number'),
      'At least one category must be scored',
    ),
  title: z.string().trim().max(120).optional(),
  comment: z.string().trim().max(4000).optional(),
  photos: z.array(z.string().url()).max(10).default([]),
});
export type CreateReviewDto = z.infer<typeof createReviewSchema>;

export const moderateReviewSchema = z.object({
  status: z.enum(['PUBLISHED', 'REJECTED', 'HIDDEN']),
  reason: z.string().trim().max(500).optional(),
});
export type ModerateReviewDto = z.infer<typeof moderateReviewSchema>;

export const respondSchema = z.object({
  body: z.string().trim().min(10).max(2000),
});
export type RespondDto = z.infer<typeof respondSchema>;

export const listReviewsQuerySchema = z.object({
  hotelId: z.string().optional(),
  customerId: z.string().optional(),
  status: z.enum(['PENDING_MODERATION', 'PUBLISHED', 'REJECTED', 'HIDDEN']).optional(),
  minRating: z.coerce.number().min(1).max(5).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListReviewsQuery = z.infer<typeof listReviewsQuerySchema>;
