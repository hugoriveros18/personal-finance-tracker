import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { LiabilityPaymentForm } from './LiabilityPaymentModal';
import { createLiabilityPayment } from '../api/liabilityPayments';
import { toISODate } from '@/shared/lib/dates';
import type { Account } from '@/shared/types/domain';

vi.mock('../api/liabilityPayments', () => ({
  liabilityPaymentKeys: { all: ['liability-payments'] },
  createLiabilityPayment: vi.fn(),
}));
vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }));
beforeEach(() => vi.clearAllMocks());
const account: Account = {
  id: 'account',
  name: 'Checking',
  availableBalance: 10_000,
  savingsBalance: 0,
  liabilitiesBalance: 20_000,
  total: 10_000,
  createdAt: '',
  updatedAt: '',
};

describe('Liability payment validation', () => {
  it.each(['en', 'es'] as const)(
    'translates the available balance limit in %s',
    async (language) => {
      renderWithProviders(<LiabilityPaymentForm account={account} onClose={vi.fn()} />, {
        language,
      });
      const input = screen.getByLabelText(language === 'en' ? 'Amount' : 'Valor');
      fireEvent.change(input, { target: { value: '150' } });
      fireEvent.submit(input.closest('form')!);
      expect(
        await screen.findByText(
          language === 'en' ? 'Exceeds available balance' : 'Excede el disponible',
        ),
      ).toBeInTheDocument();
      expect(createLiabilityPayment).not.toHaveBeenCalled();
    },
  );
  it.each(['en', 'es'] as const)('translates the liabilities limit in %s', async (language) => {
    renderWithProviders(
      <LiabilityPaymentForm
        account={{
          ...account,
          availableBalance: 20_000,
          liabilitiesBalance: 10_000,
          total: 20_000,
        }}
        onClose={vi.fn()}
      />,
      { language },
    );
    const input = screen.getByLabelText(language === 'en' ? 'Amount' : 'Valor');
    fireEvent.change(input, { target: { value: '150' } });
    fireEvent.submit(input.closest('form')!);
    expect(
      await screen.findByText(
        language === 'en' ? 'Exceeds liabilities balance' : 'Excede los pasivos',
      ),
    ).toBeInTheDocument();
    expect(createLiabilityPayment).not.toHaveBeenCalled();
  });
  it('uses the smaller balance for pay all and submits COP cents with English fields', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LiabilityPaymentForm account={account} onClose={vi.fn()} />);
    await user.type(screen.getByLabelText('Description'), 'Payment');
    await user.click(screen.getByRole('button', { name: 'Pay all' }));
    await user.click(screen.getByRole('button', { name: 'New payment' }));
    await waitFor(() =>
      expect(createLiabilityPayment).toHaveBeenCalledWith({
        accountId: 'account',
        description: 'Payment',
        date: toISODate(new Date()),
        amount: 10_000,
      }),
    );
  });
});
