import { describe, expect, it } from 'vitest';
import { buildPaginated, paginationQuerySchema } from './pagination.js';

describe('paginationQuerySchema', () => {
  it('applies defaults', () => {
    const parsed = paginationQuerySchema.parse({});
    expect(parsed).toEqual({ page: 1, pageSize: 25 });
  });

  it('coerces numeric strings', () => {
    const parsed = paginationQuerySchema.parse({ page: '3', pageSize: '50' });
    expect(parsed).toEqual({ page: 3, pageSize: 50 });
  });

  it('rejects pageSize > 100', () => {
    expect(() => paginationQuerySchema.parse({ pageSize: 200 })).toThrow();
  });

  it('rejects page < 1', () => {
    expect(() => paginationQuerySchema.parse({ page: 0 })).toThrow();
  });
});

describe('buildPaginated', () => {
  it('computes totalPages from total and pageSize', () => {
    const result = buildPaginated([1, 2, 3], 73, { page: 1, pageSize: 25 });
    expect(result.total).toBe(73);
    expect(result.totalPages).toBe(3);
    expect(result.items).toEqual([1, 2, 3]);
  });

  it('handles zero total', () => {
    const result = buildPaginated([], 0, { page: 1, pageSize: 25 });
    expect(result.totalPages).toBe(0);
  });
});
