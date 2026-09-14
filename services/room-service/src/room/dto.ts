import { AmenityCode, RoomStatus, RoomTypeCode } from '@staysphere/contracts';
import { z } from 'zod';

export const createRoomTypeSchema = z.object({
  hotelId: z.string().min(1),
  code: z.nativeEnum(RoomTypeCode),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).optional(),
  maxOccupancy: z.number().int().min(1).max(12),
  maxAdults: z.number().int().min(1).max(12),
  maxChildren: z.number().int().min(0).max(10).default(0),
  sizeSquareMetres: z.number().int().min(5).max(1000).optional(),
  beds: z
    .array(
      z.object({
        type: z.enum(['SINGLE', 'DOUBLE', 'QUEEN', 'KING', 'TWIN', 'SOFA_BED', 'BUNK']),
        count: z.number().int().min(1).max(6),
      }),
    )
    .default([]),
  amenities: z.array(z.nativeEnum(AmenityCode)).default([]),
});
export type CreateRoomTypeDto = z.infer<typeof createRoomTypeSchema>;

export const createRoomSchema = z.object({
  hotelId: z.string().min(1),
  branchId: z.string().optional(),
  roomNumber: z.string().trim().toUpperCase().min(1).max(10),
  floor: z.number().int().min(-9).max(99).optional(),
  building: z.string().trim().max(40).optional(),
  roomTypeId: z.string().min(1),
  maxOccupancy: z.number().int().min(1).max(12).optional(),
  amenities: z.array(z.nativeEnum(AmenityCode)).default([]),
});
export type CreateRoomDto = z.infer<typeof createRoomSchema>;

/** Bulk-creates a whole floor at once. */
export const generateFloorSchema = z.object({
  hotelId: z.string().min(1),
  roomTypeId: z.string().min(1),
  floor: z.number().int().min(-9).max(99),
  count: z.number().int().min(1).max(99),
  startAt: z.number().int().min(1).max(99).default(1),
});
export type GenerateFloorDto = z.infer<typeof generateFloorSchema>;

export const changeRoomStatusSchema = z.object({
  status: z.nativeEnum(RoomStatus),
  reason: z.string().trim().max(500).optional(),
  note: z.string().trim().max(200).optional(),
});
export type ChangeRoomStatusDto = z.infer<typeof changeRoomStatusSchema>;

export const blockRoomSchema = z.object({
  until: z.string().datetime().optional(),
  reason: z.string().trim().min(3).max(500),
});
export type BlockRoomDto = z.infer<typeof blockRoomSchema>;

export const listRoomsQuerySchema = z.object({
  hotelId: z.string().min(1),
  floor: z.coerce.number().int().optional(),
  roomTypeId: z.string().optional(),
  status: z.nativeEnum(RoomStatus).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(100),
});
export type ListRoomsQuery = z.infer<typeof listRoomsQuerySchema>;
