import { z } from 'zod';

export const createInvoiceSchema = z.object({
  hotelId: z.string().min(1),
  stayId: z.string().min(1),
  bookingId: z.string().min(1),
  customerId: z.string().min(1),
  hotelName: z.string().trim().min(2).max(160),
  billToName: z.string().trim().min(2).max(160),
  billToEmail: z.string().trim().toLowerCase().email(),
  billToAddress: z.string().trim().max(500).optional(),
  taxNumber: z.string().trim().max(40).optional(),
  currency: z.string().trim().toUpperCase().length(3),
  discountMinor: z.number().int().min(0).default(0),
  paidMinor: z.number().int().min(0).default(0),
  dueInDays: z.number().int().min(0).max(120).default(0),
  lines: z
    .array(
      z.object({
        description: z.string().trim().min(1).max(200),
        quantity: z.number().int().min(1).max(1000),
        unitPriceMinor: z.number().int(),
        taxable: z.boolean().default(true),
      }),
    )
    .min(1),
  taxComponents: z
    .array(
      z.object({
        code: z.string().trim().toUpperCase().min(2).max(12),
        label: z.string().trim().min(2).max(80),
        basisPoints: z.number().int().min(0).max(10_000),
        exclusive: z.boolean().default(true),
      }),
    )
    .optional(),
});
export type CreateInvoiceDto = z.infer<typeof createInvoiceSchema>;

export const recordPaymentSchema = z.object({
  amountMinor: z.number().int().positive(),
  reference: z.string().trim().max(120).optional(),
});
export type RecordPaymentDto = z.infer<typeof recordPaymentSchema>;

export const voidInvoiceSchema = z.object({
  reason: z.string().trim().min(5).max(500),
});
export type VoidInvoiceDto = z.infer<typeof voidInvoiceSchema>;

export const listInvoicesQuerySchema = z.object({
  hotelId: z.string().optional(),
  customerId: z.string().optional(),
  status: z.enum(['DRAFT', 'ISSUED', 'PAID', 'PARTIALLY_PAID', 'OVERDUE', 'VOID']).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;
