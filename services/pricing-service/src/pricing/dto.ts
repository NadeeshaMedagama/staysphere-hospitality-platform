import { z } from 'zod';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must be formatted as YYYY-MM-DD')
  .transform((value) => new Date(`${value}T00:00:00.000Z`));

export const createRatePlanSchema = z.object({
  hotelId: z.string().min(1),
  roomTypeId: z.string().min(1),
  name: z.string().trim().min(2).max(120),
  currency: z.string().trim().toUpperCase().length(3),
  baseRateMinor: z.number().int().min(0),
  weekendMultiplier: z.number().min(0.5).max(5).default(1),
  taxBasisPoints: z.number().int().min(0).max(10_000).default(0),
  minRateMinor: z.number().int().min(0).optional(),
  maxRateMinor: z.number().int().min(0).optional(),
  effectiveFrom: isoDate,
  effectiveTo: isoDate.optional(),
  seasons: z
    .array(
      z.object({
        label: z.string().trim().min(2).max(80),
        startsOn: isoDate,
        endsOn: isoDate,
        nightlyRateMinor: z.number().int().min(0),
      }),
    )
    .default([]),
  longStayDiscounts: z
    .array(
      z.object({
        minNights: z.number().int().min(2).max(365),
        basisPoints: z.number().int().min(1).max(9_000),
      }),
    )
    .default([]),
});
export type CreateRatePlanDto = z.infer<typeof createRatePlanSchema>;

export const createPromotionSchema = z.object({
  hotelId: z.string().optional(),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{4,24}$/, 'Codes must be 4–24 uppercase letters or digits'),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
  type: z.enum(['PERCENTAGE', 'FIXED_AMOUNT']).default('PERCENTAGE'),
  value: z.number().int().min(1),
  currency: z.string().trim().toUpperCase().length(3).optional(),
  validFrom: z.string().datetime(),
  validTo: z.string().datetime(),
  minNights: z.number().int().min(1).default(1),
  minSpendMinor: z.number().int().min(0).default(0),
  roomTypeIds: z.array(z.string()).default([]),
  maxRedemptions: z.number().int().min(1).nullable().default(null),
  maxPerCustomer: z.number().int().min(1).default(1),
  exclusive: z.boolean().default(false),
});
export type CreatePromotionDto = z.infer<typeof createPromotionSchema>;

export const validatePromotionSchema = z.object({
  code: z.string().trim().toUpperCase().min(1).max(24),
  hotelId: z.string().min(1),
  roomTypeId: z.string().min(1),
  nights: z.number().int().min(1),
  subtotalMinor: z.number().int().min(0),
  currency: z.string().trim().toUpperCase().length(3),
});
export type ValidatePromotionDto = z.infer<typeof validatePromotionSchema>;

export const quoteRequestSchema = z.object({
  hotelId: z.string().min(1),
  roomTypeId: z.string().min(1),
  occupancy: z.coerce.number().min(0).max(1).default(0),
  leadTimeDays: z.coerce.number().int().min(0).default(30),
  highDemandDate: z.coerce.boolean().default(false),
});
export type QuoteRequestDto = z.infer<typeof quoteRequestSchema>;
