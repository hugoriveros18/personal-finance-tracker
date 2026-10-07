import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { TransactionForm } from './TransactionFormModal';
import { updateTransaction } from '../api/transactions';
import type { Transaction } from '@/shared/types/domain';

const accountId = '11111111-1111-4111-8111-111111111111';
const categoryId = '22222222-2222-4222-8222-222222222222';
vi.mock('@/features/accounts/api/accounts', () => ({
  accountKeys: { all: ['accounts'] },
  listAccounts: vi.fn(async () => [
    { id: '11111111-1111-4111-8111-111111111111', name: 'Checking' },
  ]),
}));
vi.mock('@/features/categories/api/categories', () => ({
  categoryKeys: { all: ['categories'] },
  listCategories: vi.fn(async () => [
    { id: '22222222-2222-4222-8222-222222222222', name: 'Food', type: 'expense' },
  ]),
}));
vi.mock('../api/transactions', () => ({
  transactionKeys: { all: ['transactions'] },
  updateTransaction: vi.fn(),
  createTransaction: vi.fn(),
}));
vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }));
beforeEach(() => vi.clearAllMocks());
const initial: Transaction = {
  id: 'transaction',
  accountId,
  categoryId,
  categoryType: 'expense',
  description: 'Lunch',
  date: '2026-10-07T00:00:00.000Z',
  type: 'expense',
  amount: 1_001,
  createdAt: '',
  updatedAt: '',
};

describe('Transaction form', () => {
  it.each(['en', 'es'] as const)(
    'preserves the category while loading and sends the English contract in %s',
    async (language) => {
      const user = userEvent.setup();
      renderWithProviders(<TransactionForm initial={initial} mode="edit" onClose={vi.fn()} />, {
        language,
      });
      await waitFor(() =>
        expect(
          screen.getByLabelText(language === 'en' ? 'Category' : 'Categoría', {
            selector: 'input',
          }),
        ).toHaveValue('Food'),
      );
      await user.click(
        screen.getByRole('button', { name: language === 'en' ? 'Save' : 'Guardar' }),
      );
      await waitFor(() =>
        expect(updateTransaction).toHaveBeenCalledWith('transaction', {
          accountId,
          categoryId,
          description: 'Lunch',
          date: '2026-10-07',
          type: 'expense',
          amount: 1_001,
        }),
      );
    },
  );

  it('disables fields and hides save in view mode', async () => {
    renderWithProviders(<TransactionForm initial={initial} mode="view" onClose={vi.fn()} />);
    expect(screen.getByLabelText('Description')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });
});
