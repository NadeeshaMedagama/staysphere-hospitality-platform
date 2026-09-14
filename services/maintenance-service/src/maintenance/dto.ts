import { MaintenancePriority } from '@staysphere/contracts';
import { z } from 'zod';

export const createTicketSchema = z.object({
  hotelId: z.string().min(1),
  roomId: z.string().optional(),
  roomNumber: z.string().max(10).optional(),
  location: z.string().trim().max(120).optional(),
  category: z.string().trim().toUpperCase().min(2).max(40),
  summary: z.string().trim().min(5).max(200),
  details: z.string().trim().max(4000).optional(),
  reportedPriority: z.nativeEnum(MaintenancePriority).optional(),
  roomOccupied: z.boolean().default(false),
  arrivalImminent: z.boolean().default(false),
});
export type CreateTicketDto = z.infer<typeof createTicketSchema>;

export const assignTicketSchema = z.object({
  staffId: z.string().min(1),
  staffName: z.string().trim().min(2).max(120),
});
export type AssignTicketDto = z.infer<typeof assignTicketSchema>;

export const resolveTicketSchema = z.object({
  resolutionNotes: z.string().trim().min(5).max(2000),
  costMinor: z.number().int().min(0).default(0),
  currency: z.string().trim().toUpperCase().length(3).optional(),
  /** Whether the room can go back on sale now the fault is fixed. */
  returnRoomToService: z.boolean().default(true),
});
export type ResolveTicketDto = z.infer<typeof resolveTicketSchema>;

export const commentSchema = z.object({
  body: z.string().trim().min(1).max(2000),
  internal: z.boolean().default(true),
});
export type CommentDto = z.infer<typeof commentSchema>;

export const listTicketsQuerySchema = z.object({
  hotelId: z.string().min(1),
  status: z.enum(['REPORTED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(),
  priority: z.nativeEnum(MaintenancePriority).optional(),
  assignedToId: z.string().optional(),
  roomId: z.string().optional(),
  overdueOnly: z.coerce.boolean().default(false),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListTicketsQuery = z.infer<typeof listTicketsQuerySchema>;
