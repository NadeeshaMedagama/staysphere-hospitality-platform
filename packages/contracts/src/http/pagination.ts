import { z } from 'zod';
import type { ResponseMeta } from './envelope.js';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  sortBy: z.string().min(1).max(64).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface Page<T> {
  readonly items: readonly T[];
  readonly meta: Required<
    Pick<ResponseMeta, 'page' | 'pageSize' | 'totalItems' | 'totalPages' | 'hasNextPage'>
  >;
}

export function toPage<T>(
  items: readonly T[],
  totalItems: number,
  query: PaginationQuery,
): Page<T> {
  const totalPages = Math.max(1, Math.ceil(totalItems / query.pageSize));
  return {
    items,
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages,
      hasNextPage: query.page < totalPages,
    },
  };
}

/** Translates a validated pagination query into Prisma `skip`/`take` arguments. */
export function toPrismaPage(query: PaginationQuery): { skip: number; take: number } {
  return { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
}
