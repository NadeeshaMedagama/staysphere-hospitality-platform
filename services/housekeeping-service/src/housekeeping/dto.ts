import { z } from 'zod';

export const createTaskSchema = z.object({
  hotelId: z.string().min(1),
  roomId: z.string().min(1),
  roomNumber: z.string().min(1).max(10),
  floor: z.number().int().min(-9).max(99),
  type: z.enum(['CHECKOUT_CLEAN', 'STAYOVER_CLEAN', 'DEEP_CLEAN', 'INSPECTION', 'TURNDOWN']),
  nextArrivalAt: z.string().datetime().optional(),
  vip: z.boolean().default(false),
  notes: z.string().trim().max(500).optional(),
});
export type CreateTaskDto = z.infer<typeof createTaskSchema>;

export const assignTaskSchema = z.object({
  /** Omit to let the service pick the least-loaded housekeeper on shift. */
  staffId: z.string().optional(),
});
export type AssignTaskDto = z.infer<typeof assignTaskSchema>;

export const completeTaskSchema = z.object({
  checklist: z.array(z.object({ id: z.string(), completed: z.boolean() })).default([]),
  notes: z.string().trim().max(500).optional(),
});
export type CompleteTaskDto = z.infer<typeof completeTaskSchema>;

export const verifyTaskSchema = z.object({
  passed: z.boolean(),
  notes: z.string().trim().max(500).optional(),
});
export type VerifyTaskDto = z.infer<typeof verifyTaskSchema>;

export const createShiftSchema = z.object({
  hotelId: z.string().min(1),
  staffId: z.string().min(1),
  staffName: z.string().trim().min(2).max(120),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  capacity: z.number().int().min(1).max(40).default(14),
});
export type CreateShiftDto = z.infer<typeof createShiftSchema>;

export const listTasksQuerySchema = z.object({
  hotelId: z.string().min(1),
  status: z.enum(['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'VERIFIED']).optional(),
  assignedToId: z.string().optional(),
  floor: z.coerce.number().int().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(100),
});
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;
