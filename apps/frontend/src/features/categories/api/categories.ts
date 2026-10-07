import { api } from '@/shared/api/client';
import type { Category, CategoryType } from '@/shared/types/domain';

export const categoryKeys = {
  all: ['categories'] as const,
  byType: (type?: CategoryType) => ['categories', type ?? 'all'] as const,
  trend: (id: string, year: number) => ['categories', id, 'trend', year] as const,
};

export async function listCategories(type?: CategoryType): Promise<Category[]> {
  const { data } = await api.get<{ items: Category[] }>('/categories', {
    params: type ? { type } : undefined,
  });
  return data.items;
}

export async function createCategory(input: { name: string; type: CategoryType }) {
  const { data } = await api.post<{ item: Category }>('/categories', input);
  return data.item;
}

export async function updateCategory(id: string, input: { name: string }) {
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
