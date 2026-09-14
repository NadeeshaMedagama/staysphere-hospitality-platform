import { AmenityCode, DEFAULT_HOTEL_POLICY } from '@staysphere/contracts';
import { z } from 'zod';

export const hotelPolicySchema = z.object({
  checkInFrom: z.string().default(DEFAULT_HOTEL_POLICY.checkInFrom),
  checkOutBy: z.string().default(DEFAULT_HOTEL_POLICY.checkOutBy),
  minAdvanceHours: z.number().int().min(0).default(0),
  maxStayNights: z.number().int().min(1).max(365).default(90),
  cancellationPolicyCode: z.string().default('STANDARD_7_3'),
  childrenAllowed: z.boolean().default(true),
  petsAllowed: z.boolean().default(false),
  smokingAllowed: z.boolean().default(false),
  childMaxAge: z.number().int().min(0).max(17).default(12),
});

export const createHotelSchema = z.object({
  name: z.string().trim().min(2).max(160),
  legalName: z.string().trim().max(200).optional(),
  slug: z.string().trim().toLowerCase().max(60).optional(),
  description: z.string().trim().max(4000).optional(),
  starRating: z.number().int().min(1).max(5).optional(),

  addressLine1: z.string().trim().min(3).max(200),
  addressLine2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(1).max(100),
  region: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().max(20).optional(),
  countryCode: z.string().trim().toUpperCase().length(2),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  timezone: z.string().trim().max(64).default('UTC'),

  email: z.string().trim().toLowerCase().email(),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{7,20}$/),
  websiteUrl: z.string().url().optional(),

  currency: z.string().trim().toUpperCase().length(3).default('USD'),
  policy: hotelPolicySchema.default({}),
  amenities: z.array(z.nativeEnum(AmenityCode)).default([]),
});
export type CreateHotelDto = z.infer<typeof createHotelSchema>;

export const updateHotelSchema = createHotelSchema.partial().omit({ slug: true });
export type UpdateHotelDto = z.infer<typeof updateHotelSchema>;

export const createBranchSchema = z.object({
  code: z.string().trim().toUpperCase().min(2).max(16),
  name: z.string().trim().min(2).max(160),
  addressLine1: z.string().trim().min(3).max(200),
  city: z.string().trim().min(1).max(100),
  countryCode: z.string().trim().toUpperCase().length(2),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{7,20}$/)
    .optional(),
});
export type CreateBranchDto = z.infer<typeof createBranchSchema>;

export const listHotelsQuerySchema = z.object({
  city: z.string().trim().optional(),
  countryCode: z.string().trim().toUpperCase().length(2).optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'SUSPENDED', 'CLOSED']).optional(),
  amenity: z.nativeEnum(AmenityCode).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListHotelsQuery = z.infer<typeof listHotelsQuerySchema>;
