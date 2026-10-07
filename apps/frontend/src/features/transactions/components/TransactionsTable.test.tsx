import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { TransactionsTable } from './TransactionsTable';

vi.mock('../api/transactions', () => ({
  transactionKeys: { all: ['transactions'], list: () => ['transactions', 'list'] },
  deleteTransaction: vi.fn(),
  listTransactions: vi.fn(async () => ({
    items: ['income', 'expense', 'liability'].map((type) => ({
      id: type,
      type,
      description: `Record ${type}`,
      amount: 1_001,
      date: '2026-10-07',
      accountId: 'account',
      categoryId: 'category',
    })),
    total: 3,
    page: 1,
    pageSize: 25,
    totalPages: 1,
  })),
}));
vi.mock('@/features/accounts/api/accounts', () => ({
  accountKeys: { all: ['accounts'] },
  listAccounts: vi.fn(async () => [{ id: 'account', name: 'Checking' }]),
}));
vi.mock('@/features/categories/api/categories', () => ({
  categoryKeys: { all: ['categories'] },
  listCategories: vi.fn(async () => [{ id: 'category', name: 'Food' }]),
}));

describe('Transaction type labels', () => {
  it.each(['en', 'es'] as const)(
    'translates dynamic English transaction types in %s',
    async (language) => {
      renderWithProviders(<TransactionsTable />, { language });
      expect(
        screen.getByText(language === 'en' ? 'Records per page' : 'Registros por página'),
      ).toBeInTheDocument();
      for (const label of language === 'en'
        ? ['Income', 'Expense', 'Liability']
        : ['Ingreso', 'Egreso', 'Pasivo']) {
        await waitFor(() => expect(screen.getByText(label)).toBeInTheDocument());
      }
    },
  );
});
