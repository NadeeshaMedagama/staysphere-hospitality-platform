import { z } from 'zod';

export const recordAuditSchema = z.object({
  action: z.string().trim().min(3).max(80),
  resource: z.string().trim().min(2).max(60),
  resourceId: z.string().max(80).optional(),
  hotelId: z.string().optional(),
  before: z.record(z.string(), z.unknown()).nullable().default(null),
  after: z.record(z.string(), z.unknown()).nullable().default(null),
  outcome: z.enum(['SUCCESS', 'DENIED', 'FAILED']).default('SUCCESS'),
  failureCode: z.string().max(60).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type RecordAuditDto = z.infer<typeof recordAuditSchema>;

export const listAuditQuerySchema = z.object({
  actorId: z.string().optional(),
  resource: z.string().optional(),
  resourceId: z.string().optional(),
  hotelId: z.string().optional(),
  action: z.string().optional(),
  correlationId: z.string().optional(),
  outcome: z.enum(['SUCCESS', 'DENIED', 'FAILED']).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListAuditQuery = z.infer<typeof listAuditQuerySchema>;
