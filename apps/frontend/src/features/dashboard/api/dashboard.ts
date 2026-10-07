import { api } from '@/shared/api/client';
import type { Account, Movement, Transaction, LiabilityPayment } from '@/shared/types/domain';

export interface DashboardResponse {
  month: string;
  year: number;
  accounts: Account[];
  totals: {
    availableBalanceTotal: number;
    savingsBalanceTotal: number;
    liabilitiesBalanceTotal: number;
    netWorth: number;
  };
  monthSummary: {
    income: number;
    expenses: number;
    newLiabilities: number;
    liabilityPayments: number;
    movementsCount: number;
    savingsChange: number;
    flow: number;
  };
  byCategoryMonth: {
    income: { categoryId: string; name: string; type: string; total: number }[];
    expense: { categoryId: string; name: string; type: string; total: number }[];
  };
  topCategoriesMonth: DashboardResponse['byCategoryMonth'];
  topCategoriesYear: DashboardResponse['byCategoryMonth'];
  byAccount: {
    accountId: string;
    name: string;
    income: number;
    expenses: number;
    newLiabilities: number;
    liabilityPayments: number;
  }[];
  trendYear: {
    months: string[];
    income: number[];
    expenses: number[];
    newLiabilities: number[];
    liabilityPayments: number[];
    savingsChange: number[];
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

export async function fetchDashboard(params: {
  month: string;
  year: number;
}): Promise<DashboardResponse> {
  const { data } = await api.get<DashboardResponse>('/dashboard', { params });
  return data;
}
