import { z } from 'zod';

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function buildPaginated<T>(
  items: T[],
  total: number,
  { page, pageSize }: PaginationQuery,
): Paginated<T> {
  return {
    items,
    page,
    pageSize,
    total,
    totalPages: pageSize === 0 ? 0 : Math.ceil(total / pageSize),
  };
}
