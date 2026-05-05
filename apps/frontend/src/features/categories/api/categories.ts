import { api } from '@/shared/api/client';
import type { Category, CategoryTipo } from '@/shared/types/domain';

export const categoryKeys = {
  all: ['categories'] as const,
  byTipo: (tipo?: CategoryTipo) => ['categories', tipo ?? 'all'] as const,
  trend: (id: string, year: number) => ['categories', id, 'trend', year] as const,
};

export async function listCategories(tipo?: CategoryTipo): Promise<Category[]> {
  const { data } = await api.get<{ items: Category[] }>('/categories', {
    params: tipo ? { tipo } : undefined,
  });
  return data.items;
}

export async function createCategory(input: { nombre: string; tipo: CategoryTipo }) {
  const { data } = await api.post<{ item: Category }>('/categories', input);
  return data.item;
}

export async function updateCategory(id: string, input: { nombre: string }) {
  const { data } = await api.patch<{ item: Category }>(`/categories/${id}`, input);
  return data.item;
}

export async function deleteCategory(id: string): Promise<void> {
  await api.delete(`/categories/${id}`);
}

export async function getCategoryTrend(id: string, year: number) {
  const { data } = await api.get<{
    category: Category;
    year: number;
    months: string[];
    totals: number[];
  }>(`/dashboard/category-trend/${id}`, { params: { year } });
  return data;
}
