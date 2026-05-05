import { useSearchParams } from 'react-router-dom';
import { useCallback, useMemo } from 'react';
import { z, type ZodTypeAny } from 'zod';

export function useUrlFilters<S extends ZodTypeAny>(schema: S) {
  const [params, setParams] = useSearchParams();
  const obj = useMemo(() => Object.fromEntries(params.entries()), [params]);
  const filters = useMemo(() => {
    const parsed = schema.safeParse(obj);
    return (parsed.success ? parsed.data : schema.parse({})) as z.infer<S>;
  }, [obj, schema]);

  const setFilters = useCallback(
    (next: Partial<z.infer<S>> | ((prev: z.infer<S>) => z.infer<S>)) => {
      const updated =
        typeof next === 'function'
          ? (next as (p: z.infer<S>) => z.infer<S>)(filters)
          : { ...filters, ...next };
      const out = new URLSearchParams();
      for (const [k, v] of Object.entries(updated as Record<string, unknown>)) {
        if (v === undefined || v === null || v === '') continue;
        if (Array.isArray(v)) {
          if (v.length === 0) continue;
          out.set(k, v.join(','));
        } else {
          out.set(k, String(v));
        }
      }
      setParams(out, { replace: true });
    },
    [filters, setParams],
  );

  return [filters, setFilters] as const;
}
