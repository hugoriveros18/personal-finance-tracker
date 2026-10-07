import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { MovementForm } from './MovementFormModal';
import { updateMovement } from '../api/movements';
import type { Movement } from '@/shared/types/domain';

vi.mock('@/features/accounts/api/accounts', () => ({
  accountKeys: { all: ['accounts'] },
  listAccounts: vi.fn(async () => [
    { id: '11111111-1111-4111-8111-111111111111', name: 'Checking' },
    { id: '22222222-2222-4222-8222-222222222222', name: 'Other' },
  ]),
}));
vi.mock('../api/movements', () => ({
  movementKeys: { all: ['movements'] },
  createMovement: vi.fn(),
  updateMovement: vi.fn(),
}));
vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }));
const initial: Movement = {
  id: 'movement',
  sourceAccountId: '11111111-1111-4111-8111-111111111111',
  destinationAccountId: '22222222-2222-4222-8222-222222222222',
  description: 'Transfer',
  date: '2026-10-07',
  flow: 'INTER_AVAILABLE',
  amount: 1_001,
  createdAt: '',
  updatedAt: '',
};

describe('Movement form', () => {
  it('switches to an intra-account flow and submits the same account on both sides', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MovementForm initial={initial} mode="edit" onClose={vi.fn()} />);
    await user.click(screen.getByText('Available → Savings'));
    expect(screen.queryByLabelText('To account', { selector: 'input' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(updateMovement).toHaveBeenCalledWith('movement', {
        description: 'Transfer',
        date: '2026-10-07',
        flow: 'INTRA_AVAILABLE_TO_SAVINGS',
        amount: 1_001,
        sourceAccountId: initial.sourceAccountId,
        destinationAccountId: initial.sourceAccountId,
      }),
    );
  });
});
