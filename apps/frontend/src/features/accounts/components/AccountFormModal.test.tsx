import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { AccountForm } from './AccountFormModal';
import { createAccount, updateAccount } from '../api/accounts';

vi.mock('../api/accounts', () => ({
  accountKeys: { all: ['accounts'] },
  createAccount: vi.fn(),
  updateAccount: vi.fn(),
}));
vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }));
beforeEach(() => vi.clearAllMocks());

describe('Account form contracts', () => {
  it.each(['en', 'es'] as const)(
    'creates an account with English fields in %s',
    async (language) => {
      const user = userEvent.setup();
      const close = vi.fn();
      renderWithProviders(<AccountForm onClose={close} />, { language });
      await user.type(screen.getByLabelText(language === 'en' ? 'Name' : 'Nombre'), 'Checking');
      await user.click(
        screen.getByRole('button', { name: language === 'en' ? 'Save' : 'Guardar' }),
      );
      await waitFor(() =>
        expect(createAccount).toHaveBeenCalledWith({
          name: 'Checking',
          availableBalance: 0,
          savingsBalance: 0,
          liabilitiesBalance: 0,
        }),
      );
      await waitFor(() => expect(close).toHaveBeenCalled());
    },
  );

  it('submits only the name when editing, preserving immutable initial balances', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AccountForm
        initial={{
          id: 'account',
          name: 'Checking',
          availableBalance: 100,
          savingsBalance: 200,
          liabilitiesBalance: 300,
          total: 300,
          createdAt: '',
          updatedAt: '',
        }}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText('Available')).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Renamed');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateAccount).toHaveBeenCalledWith('account', { name: 'Renamed' }));
  });
});
