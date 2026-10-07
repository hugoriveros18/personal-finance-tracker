export type Language = 'es' | 'en';
export type ThemeMode = 'light' | 'dark';
export type CategoryType = 'income' | 'expense';
export type TransactionType = 'income' | 'expense' | 'liability';
export type MovementFlow =
  | 'INTER_AVAILABLE'
  | 'INTRA_AVAILABLE_TO_SAVINGS'
  | 'INTRA_SAVINGS_TO_AVAILABLE';

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarPath: string | null;
  preferredLanguage: Language;
  preferredTheme: ThemeMode;
}

export interface Category {
  id: string;
  name: string;
  type: CategoryType;
  createdAt: string;
  updatedAt: string;
}

export interface Account {
  id: string;
  name: string;
  availableBalance: number;
  savingsBalance: number;
  liabilitiesBalance: number;
  total: number;
  createdAt: string;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  accountId: string;
  categoryId: string;
  categoryType: CategoryType;
  description: string;
  date: string;
  type: TransactionType;
  amount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Movement {
  id: string;
  sourceAccountId: string;
  destinationAccountId: string;
  flow: MovementFlow;
  description: string;
  date: string;
  amount: number;
  createdAt: string;
  updatedAt: string;
}

export interface LiabilityPayment {
  id: string;
  accountId: string;
  description: string;
  date: string;
  amount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  totals?: Record<string, number>;
}
