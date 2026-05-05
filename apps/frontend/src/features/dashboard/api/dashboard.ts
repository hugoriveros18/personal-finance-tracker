import { api } from '@/shared/api/client';
import type { Account, Movement, Transaction, LiabilityPayment } from '@/shared/types/domain';

export interface DashboardResponse {
  month: string;
  year: number;
  accounts: Account[];
  totals: {
    disponibleTotal: number;
    ahorroTotal: number;
    pasivosTotal: number;
    netWorth: number;
  };
  monthSummary: {
    ingresos: number;
    egresos: number;
    pasivosNuevos: number;
    liabilityPayments: number;
    movementsCount: number;
    ahorroDelta: number;
    flow: number;
  };
  byCategoryMonth: {
    ingreso: { categoryId: string; nombre: string; tipo: string; total: number }[];
    egreso: { categoryId: string; nombre: string; tipo: string; total: number }[];
  };
  topCategoriesMonth: DashboardResponse['byCategoryMonth'];
  topCategoriesYear: DashboardResponse['byCategoryMonth'];
  byAccount: {
    accountId: string;
    nombre: string;
    ingresos: number;
    egresos: number;
    pasivosNuevos: number;
    liabilityPayments: number;
  }[];
  trendYear: {
    months: string[];
    ingresos: number[];
    egresos: number[];
    pasivosNuevos: number[];
    liabilityPayments: number[];
    ahorroDelta: number[];
  };
  recent: {
    transactions: Transaction[];
    movements: Movement[];
    liabilityPayments: LiabilityPayment[];
  };
}

export const dashboardKeys = {
  byMonth: (month: string) => ['dashboard', month] as const,
};

export async function fetchDashboard(params: { month: string; year: number }): Promise<DashboardResponse> {
  const { data } = await api.get<DashboardResponse>('/dashboard', { params });
  return data;
}
