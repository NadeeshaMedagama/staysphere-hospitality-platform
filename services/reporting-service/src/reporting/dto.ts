import { z } from 'zod';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must be formatted as YYYY-MM-DD')
  .transform((value) => new Date(`${value}T00:00:00.000Z`));

export const periodQuerySchema = z
  .object({
    hotelId: z.string().min(1),
    from: isoDate,
    to: isoDate,
    /** Include the equivalent preceding period for a like-for-like comparison. */
    compare: z.coerce.boolean().default(false),
  })
  .refine((value) => value.to >= value.from, {
    message: 'to must not be earlier than from',
    path: ['to'],
  });
export type PeriodQuery = z.infer<typeof periodQuerySchema>;

export const trendQuerySchema = periodQuerySchema.innerType().extend({
  granularity: z.enum(['day', 'week', 'month']).default('day'),
});
export type TrendQuery = z.infer<typeof trendQuerySchema>;

export const recordDailySchema = z.object({
  hotelId: z.string().min(1),
  date: isoDate,
  roomsAvailable: z.number().int().min(0),
  roomsSold: z.number().int().min(0),
  roomsOutOfOrder: z.number().int().min(0).default(0),
  roomRevenueMinor: z.number().int().min(0),
  serviceRevenueMinor: z.number().int().min(0).default(0),
  taxMinor: z.number().int().min(0).default(0),
  currency: z.string().trim().toUpperCase().length(3).default('USD'),
  arrivals: z.number().int().min(0).default(0),
  departures: z.number().int().min(0).default(0),
  cancellations: z.number().int().min(0).default(0),
  noShows: z.number().int().min(0).default(0),
});
export type RecordDailyDto = z.infer<typeof recordDailySchema>;
