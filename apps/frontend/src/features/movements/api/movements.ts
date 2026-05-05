import { api } from '@/shared/api/client';
import type { Movement, MovementFlujo, Paginated } from '@/shared/types/domain';

export const movementKeys = {
  all: ['movements'] as const,
  list: (params: Record<string, unknown>) => ['movements', 'list', params] as const,
};

export async function listMovements(
  params: Record<string, string | number | undefined>,
): Promise<Paginated<Movement>> {
  const { data } = await api.get<Paginated<Movement>>('/movements', { params });
  return data;
}

export async function createMovement(input: {
  descripcion: string;
  fecha: string;
  flujo: MovementFlujo;
  valor: number;
  cuentaEmisoraId: string;
  cuentaReceptoraId: string;
}): Promise<Movement> {
  const { data } = await api.post<{ item: Movement }>('/movements', input);
  return data.item;
}

export async function updateMovement(
  id: string,
  input: Partial<{
    descripcion: string;
    fecha: string;
    flujo: MovementFlujo;
    valor: number;
    cuentaEmisoraId: string;
    cuentaReceptoraId: string;
  }>,
): Promise<Movement> {
  const { data } = await api.patch<{ item: Movement }>(`/movements/${id}`, input);
  return data.item;
}

export async function deleteMovement(id: string): Promise<void> {
  await api.delete(`/movements/${id}`);
}
