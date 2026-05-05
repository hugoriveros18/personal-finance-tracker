import { api } from '@/shared/api/client';
import type { LiabilityPayment, Paginated } from '@/shared/types/domain';

export const liabilityPaymentKeys = {
  all: ['liability-payments'] as const,
  list: (params: Record<string, unknown>) => ['liability-payments', 'list', params] as const,
};

export async function listLiabilityPayments(
  params: Record<string, string | number | undefined>,
): Promise<Paginated<LiabilityPayment>> {
  const { data } = await api.get<Paginated<LiabilityPayment>>('/liability-payments', { params });
  return data;
}

export async function createLiabilityPayment(input: {
  descripcion: string;
  fecha: string;
  valor: number;
  accountId: string;
}): Promise<LiabilityPayment> {
  const { data } = await api.post<{ item: LiabilityPayment }>('/liability-payments', input);
  return data.item;
}

export async function updateLiabilityPayment(
  id: string,
  input: Partial<{ descripcion: string; fecha: string; valor: number; accountId: string }>,
): Promise<LiabilityPayment> {
  const { data } = await api.patch<{ item: LiabilityPayment }>(`/liability-payments/${id}`, input);
  return data.item;
}

export async function deleteLiabilityPayment(id: string): Promise<void> {
  await api.delete(`/liability-payments/${id}`);
}
