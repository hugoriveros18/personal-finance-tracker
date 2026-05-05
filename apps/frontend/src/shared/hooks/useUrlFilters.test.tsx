import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { z } from 'zod';
import { useUrlFilters } from './useUrlFilters';
import type { ReactNode } from 'react';

const schema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  tipos: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(',').filter(Boolean) : undefined)),
});

function wrapper(initialEntries: string[]) {
  return ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
  );
}

describe('useUrlFilters', () => {
  it('returns schema defaults when URL has no params', () => {
    const { result } = renderHook(() => useUrlFilters(schema), {
      wrapper: wrapper(['/']),
    });
    const [filters] = result.current;
    expect(filters.page).toBe(1);
    expect(filters.q).toBeUndefined();
  });

  it('parses URL params through the schema', () => {
    const { result } = renderHook(() => useUrlFilters(schema), {
      wrapper: wrapper(['/?q=lunch&page=3']),
    });
    const [filters] = result.current;
    expect(filters.q).toBe('lunch');
    expect(filters.page).toBe(3);
  });

  it('parses CSV string into array', () => {
    const { result } = renderHook(() => useUrlFilters(schema), {
      wrapper: wrapper(['/?tipos=ingreso,egreso']),
    });
    const [filters] = result.current;
    expect(filters.tipos).toEqual(['ingreso', 'egreso']);
  });

  it('setFilters merges partial updates and skips empty values', () => {
    const { result } = renderHook(() => useUrlFilters(schema), {
      wrapper: wrapper(['/?q=foo&page=2']),
    });
    act(() => {
      result.current[1]({ q: '' });
    });
    const [filters] = result.current;
    expect(filters.q).toBeUndefined();
    expect(filters.page).toBe(2);
  });
});
