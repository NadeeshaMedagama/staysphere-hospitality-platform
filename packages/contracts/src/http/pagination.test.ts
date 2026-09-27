import { describe, expect, it } from 'vitest';
import { MAX_PAGE_SIZE, paginationQuerySchema, toPage, toPrismaPage } from './pagination.js';

describe('pagination', () => {
  it('applies defaults for an empty query', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20, sortOrder: 'desc' });
  });

  it('coerces numeric strings coming off the query string', () => {
    expect(paginationQuerySchema.parse({ page: '3', pageSize: '50' })).toMatchObject({
      page: 3,
      pageSize: 50,
    });
  });

  it('caps page size so a client cannot request the whole table', () => {
    expect(() => paginationQuerySchema.parse({ pageSize: MAX_PAGE_SIZE + 1 })).toThrow();
  });

  it('translates to Prisma skip/take', () => {
    const query = paginationQuerySchema.parse({ page: 3, pageSize: 25 });
    expect(toPrismaPage(query)).toEqual({ skip: 50, take: 25 });
  });

  it('computes page metadata', () => {
    const query = paginationQuerySchema.parse({ page: 2, pageSize: 20 });
    expect(toPage(['a', 'b'], 45, query).meta).toEqual({
      page: 2,
      pageSize: 20,
      totalItems: 45,
      totalPages: 3,
      hasNextPage: true,
    });
  });

  it('reports one page and no next page for an empty result set', () => {
    const query = paginationQuerySchema.parse({});
    expect(toPage([], 0, query).meta).toMatchObject({ totalPages: 1, hasNextPage: false });
  });
});
