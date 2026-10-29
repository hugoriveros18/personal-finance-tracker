import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/shared/stores/authStore';
import { useAiChatStore } from '../store';
import {
  getAiCapabilities,
  cancelBatchItem,
  prepareBatchItem,
  cancelDraft,
  confirmTransaction,
  interpretTransaction,
} from '../api';
import { AiTransactionChat } from './AiTransactionChat';

const accountId = '11111111-1111-4111-8111-111111111111';
const categoryId = '22222222-2222-4222-8222-222222222222';
const draft = {
  id: 'draft',
  expiresAt: '2030-01-01T00:00:00Z',
  proposal: {
    type: 'expense' as const,
    amount: 3_500_000,
    description: 'Almuerzo',
    date: '2026-10-27',
    accountId,
    categoryId,
    accountSource: 'default' as const,
    dateSource: 'today' as const,
  },
};
vi.mock('../api', () => ({
  getAiCapabilities: vi.fn(async () => ({ enabled: true })),
  interpretTransaction: vi.fn(),
  confirmTransaction: vi.fn(),
  cancelDraft: vi.fn(),
  prepareBatchItem: vi.fn(),
  cancelBatchItem: vi.fn(),
}));
vi.mock('@/features/accounts/api/accounts', () => ({
  accountKeys: { all: ['accounts'] },
  listAccounts: vi.fn(async () => [
    { id: '11111111-1111-4111-8111-111111111111', name: 'Bancolombia' },
  ]),
}));
vi.mock('@/features/categories/api/categories', () => ({
  categoryKeys: { all: ['categories'] },
  listCategories: vi.fn(async () => [
    { id: '22222222-2222-4222-8222-222222222222', name: 'Alimentación', type: 'expense' },
  ]),
}));

beforeEach(() => {
  vi.clearAllMocks();
  useAiChatStore.getState().reset();
  vi.mocked(interpretTransaction).mockResolvedValue(draft);
  vi.mocked(confirmTransaction).mockResolvedValue({
    id: 'saved',
    ...draft.proposal,
    type: 'expense',
    categoryType: 'expense',
    createdAt: '',
    updatedAt: '',
  });
  vi.mocked(cancelDraft).mockResolvedValue(undefined);
});

describe('Local AI transaction chat', () => {
  it.each(['es', 'en'] as const)(
    'requires explicit confirmation and sends integer cents in %s',
    async (language) => {
      const user = userEvent.setup();
      renderWithProviders(<AiTransactionChat opened onClose={vi.fn()} />, { language });
      const message = screen.getByLabelText(
        language === 'es' ? 'Describe tu transacción' : 'Describe your transaction',
      );
      await waitFor(() => expect(message).toBeEnabled());
      await user.type(message, 'Gasté 35 mil');
      await user.click(
        screen.getByRole('button', {
          name: language === 'es' ? 'Enviar' : 'Send',
        }),
      );
      const confirm = await screen.findByRole('button', {
        name: language === 'es' ? 'Registrar' : 'Register',
      });
      await waitFor(() => expect(confirm).toBeEnabled());
      expect(confirmTransaction).not.toHaveBeenCalled();
      expect(
        screen.getByLabelText(language === 'es' ? 'Cuenta' : 'Account', { selector: 'input' }),
      ).toHaveValue('Bancolombia');
      const amount = screen.getByLabelText(language === 'es' ? 'Valor' : 'Amount');
      await user.clear(amount);
      await user.type(amount, '36000');
      await user.click(confirm);
      await waitFor(() =>
        expect(confirmTransaction).toHaveBeenCalledWith('draft', {
          type: 'expense',
          amount: 3_600_000,
          description: 'Almuerzo',
          date: '2026-10-27',
          accountId,
          categoryId,
        }),
      );
      expect(
        await screen.findByText(/Transacción registrada|Transaction registered/),
      ).toBeVisible();
    },
  );
  it('lets the user select missing entities and cancel without saving', async () => {
    const user = userEvent.setup();
    useAiChatStore.getState().add({
      id: 'one',
      message: 'Compré café',
      status: 'pending',
      draft: {
        ...draft,
        proposal: {
          ...draft.proposal,
          accountId: null,
          accountSource: 'missing',
          categoryId: null,
        },
      },
    });
    renderWithProviders(<AiTransactionChat opened onClose={vi.fn()} />);
    const confirm = screen.getByRole('button', { name: 'Register' });
    expect(confirm).toBeDisabled();
    await user.click(screen.getByLabelText('Account', { selector: 'input' }));
    await user.click(await screen.findByRole('option', { name: 'Bancolombia' }));
    await user.click(screen.getByLabelText('Category', { selector: 'input' }));
    await user.click(await screen.findByRole('option', { name: 'Alimentación' }));
    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(cancelDraft).toHaveBeenCalledWith('draft'));
    expect(confirmTransaction).not.toHaveBeenCalled();
    expect(await screen.findByText(/Registration cancelled/)).toBeVisible();
  });
  it('shows provider errors without opening a confirmation form', async () => {
    vi.mocked(interpretTransaction).mockRejectedValue({
      isAxiosError: true,
      response: { data: { error: { code: 'AI_INVALID_RESPONSE' } } },
    });
    const user = userEvent.setup();
    renderWithProviders(<AiTransactionChat opened onClose={vi.fn()} />);
    const message = screen.getByLabelText('Describe your transaction');
    await waitFor(() => expect(message).toBeEnabled());
    await user.type(message, 'Gasté 35 mil');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText(/could not interpret the message/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Register' })).not.toBeInTheDocument();
    expect(confirmTransaction).not.toHaveBeenCalled();
  });
  it('preserves history across closing/remounting and clears it on logout', () => {
    useAiChatStore.getState().add({ id: 'old', message: 'Earlier message', status: 'cancelled' });
    const view = renderWithProviders(<AiTransactionChat opened onClose={vi.fn()} />);
    expect(screen.getByText('Earlier message')).toBeVisible();
    view.unmount();
    renderWithProviders(<AiTransactionChat opened onClose={vi.fn()} />);
    expect(screen.getByText('Earlier message')).toBeVisible();
    act(() => useAuthStore.getState().clear());
    expect(useAiChatStore.getState().entries).toEqual([]);
  });
  it('fills examples without sending and focuses the message field', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AiTransactionChat opened onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Compré un café por 7500 pesos' }));
    expect(screen.getByLabelText('Describe your transaction')).toHaveValue(
      'Compré un café por 7500 pesos',
    );
    expect(screen.getByLabelText('Describe your transaction')).toHaveFocus();
    expect(interpretTransaction).not.toHaveBeenCalled();
  });
  it('retries an interpretation in place without duplicating the original message', async () => {
    useAiChatStore
      .getState()
      .add({ id: 'failed', message: 'Gasté 35 mil', status: 'error', errorCode: 'AI_TIMEOUT' });
    const user = userEvent.setup();
    renderWithProviders(<AiTransactionChat opened onClose={vi.fn()} />);
    const retry = screen.getByRole('button', { name: 'Try again' });
    await waitFor(() => expect(retry).toBeEnabled());
    await user.click(retry);
    await screen.findByRole('button', { name: 'Register' });
    expect(useAiChatStore.getState().entries).toHaveLength(1);
    expect(useAiChatStore.getState().entries[0]?.id).toBe('failed');
    expect(interpretTransaction).toHaveBeenCalledTimes(1);
    expect(confirmTransaction).not.toHaveBeenCalled();
  });
  it('recovers the original message for editing without another model call', async () => {
    useAiChatStore.getState().add({
      id: 'failed',
      message: 'Gasté 35 mil',
      status: 'error',
      errorCode: 'AI_INVALID_RESPONSE',
    });
    const user = userEvent.setup();
    renderWithProviders(<AiTransactionChat opened onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Edit message' }));
    expect(screen.getByLabelText('Describe your transaction')).toHaveValue('Gasté 35 mil');
    expect(interpretTransaction).not.toHaveBeenCalled();
  });
  it('freezes uncertain saves and retries the identical confirmation without reinterpreting', async () => {
    useAiChatStore.getState().add({ id: 'one', message: 'Gasté 35 mil', status: 'pending', draft });
    vi.mocked(confirmTransaction).mockRejectedValueOnce(new Error('Lost response'));
    const user = userEvent.setup();
    renderWithProviders(<AiTransactionChat opened onClose={vi.fn()} />);
    const confirm = screen.getByRole('button', { name: 'Register' });
    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);
    const retry = await screen.findByRole('button', { name: 'Retry registration' });
    expect(screen.getByLabelText('Amount')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    await user.click(retry);
    await screen.findByText(/Transaction registered/);
    expect(confirmTransaction).toHaveBeenCalledTimes(2);
    expect(vi.mocked(confirmTransaction).mock.calls[0]).toEqual(
      vi.mocked(confirmTransaction).mock.calls[1],
    );
    expect(interpretTransaction).not.toHaveBeenCalled();
  });
  it('lets the user register a liability using an existing expense category', async () => {
    useAiChatStore
      .getState()
      .add({ id: 'credit', message: 'Gasté 35 mil', status: 'pending', draft });
    const user = userEvent.setup();
    renderWithProviders(<AiTransactionChat opened onClose={vi.fn()} />);
    const type = screen.getByLabelText('Type', { selector: 'input' });
    expect(type).toHaveValue('Expense');
    await user.click(type);
    await user.click(await screen.findByRole('option', { name: 'Liability' }));
    expect(screen.getByLabelText('Category', { selector: 'input' })).toHaveValue('Alimentación');
    expect(screen.getByText(/available balance will stay the same/)).toBeVisible();
    const register = screen.getByRole('button', { name: 'Register' });
    await waitFor(() => expect(register).toBeEnabled());
    await user.click(register);
    await waitFor(() =>
      expect(confirmTransaction).toHaveBeenCalledWith(
        'draft',
        expect.objectContaining({ type: 'liability', categoryId, amount: 3_500_000 }),
      ),
    );
  });
  it('shows the submitted snapshot when restoring an uncertain confirmation', async () => {
    const input = {
      type: 'expense' as const,
      date: draft.proposal.date,
      accountId,
      categoryId,
      amount: 3_600_000,
      description: 'Submitted amount',
    };
    useAiChatStore.getState().add({
      id: 'recover',
      message: 'Gasté 35 mil',
      status: 'pending',
      draft,
      values: { amount: 1_000_000, description: 'Older edit' },
      confirmation: { state: 'uncertain', input },
    });
    const user = userEvent.setup();
    renderWithProviders(<AiTransactionChat opened onClose={vi.fn()} />);
    expect(screen.getByLabelText('Amount')).toHaveValue('$36.000,00');
    expect(screen.getByLabelText('Description')).toHaveValue('Submitted amount');
    expect(screen.getByLabelText('Amount')).toBeDisabled();
    expect(confirmTransaction).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Retry registration' }));
    await waitFor(() => expect(confirmTransaction).toHaveBeenCalledWith('draft', input));
  });
  it('explains when browser storage is unavailable while keeping manual entry available', async () => {
    useAiChatStore.setState({ storageAvailable: false });
    renderWithProviders(<AiTransactionChat opened onClose={vi.fn()} />);
    expect(screen.getByText(/could not save this chat in this tab/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Register manually' })).toBeEnabled();
    await waitFor(() => expect(screen.getByLabelText('Describe your transaction')).toBeEnabled());
  });
});

const sourceContext = { dateText: null, accountText: null, categoryText: null, paymentText: null };
const grouped = {
  id: 'batch',
  message: 'Hoy: café 35k y almuerzo 35k',
  referenceDate: '2026-10-28',
  notes: [],
  items: [
    { id: 'first', sourceText: 'café 35k', context: sourceContext, kind: 'transaction' },
    { id: 'second', sourceText: 'almuerzo 35k', context: sourceContext, kind: 'transaction' },
  ],
};
const enterCollection = async () => {
  vi.mocked(interpretTransaction).mockResolvedValue(grouped);
  vi.mocked(prepareBatchItem).mockImplementation(async (_batch, id) => ({
    draft: { ...draft, id },
    result: null,
  }));
  vi.mocked(cancelBatchItem).mockResolvedValue(undefined);
  const user = userEvent.setup();
  renderWithProviders(<AiTransactionChat opened onClose={vi.fn()} />);
  const input = screen.getByLabelText('Describe your transaction');
  await waitFor(() => expect(input).toBeEnabled());
  await user.type(input, grouped.message);
  await user.click(screen.getByRole('button', { name: 'Send' }));
  const register = await screen.findByRole('button', { name: 'Register selected (2)' });
  await waitFor(() => expect(register).toBeEnabled());
  return { user, register };
};
describe('Collection review without removing individual registration', () => {
  it('prepares independently, saves only selected rows after explicit approval, and keeps receipts', async () => {
    const { user, register } = await enterCollection();
    expect(prepareBatchItem).toHaveBeenCalledTimes(2);
    expect(confirmTransaction).not.toHaveBeenCalled();
    await user.click(register);
    await waitFor(() => expect(confirmTransaction).toHaveBeenCalledTimes(2));
    expect(vi.mocked(confirmTransaction).mock.calls.map((call) => call[0])).toEqual([
      'first',
      'second',
    ]);
    await waitFor(() =>
      expect(useAiChatStore.getState().entries.every((entry) => entry.status === 'confirmed')).toBe(
        true,
      ),
    );
    expect(screen.getByLabelText('Describe your transaction')).toBeEnabled();
  });
  it('stops on an uncertain save and preserves the exact submitted row for recovery', async () => {
    vi.mocked(confirmTransaction).mockRejectedValueOnce(new Error('Response lost'));
    const { user, register } = await enterCollection();
    await user.click(register);
    const retry = await screen.findByRole('button', { name: 'Retry registration' });
    expect(confirmTransaction).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Amount')).toBeDisabled();
    await user.click(retry);
    await waitFor(() => expect(useAiChatStore.getState().entries[0]?.status).toBe('confirmed'));
    expect(vi.mocked(confirmTransaction).mock.calls[0]).toEqual(
      vi.mocked(confirmTransaction).mock.calls[1],
    );
    expect(useAiChatStore.getState().entries[1]?.status).toBe('pending');
  });
  it('discards prepared records without confirming any of them', async () => {
    const { user } = await enterCollection();
    await user.click(screen.getByRole('button', { name: 'Discard pending records' }));
    await waitFor(() => expect(cancelBatchItem).toHaveBeenCalledTimes(2));
    expect(confirmTransaction).not.toHaveBeenCalled();
    expect(useAiChatStore.getState().entries.every((entry) => entry.status === 'cancelled')).toBe(
      true,
    );
  });
});

describe('Visible composer size validation', () => {
  it.each(['es', 'en'] as const)(
    'shows the character count and rejects excess text without truncating in %s',
    async (language) => {
      const user = userEvent.setup();
      renderWithProviders(<AiTransactionChat opened onClose={vi.fn()} />, { language });
      const input = screen.getByLabelText(
        language === 'es' ? 'Describe tu transacción' : 'Describe your transaction',
      );
      await waitFor(() => expect(input).toBeEnabled());
      expect(
        screen.getByText(language === 'es' ? '0 / 2.000 caracteres' : '0 / 2,000 characters'),
      ).toBeVisible();
      const pasted = 'a'.repeat(2001);
      fireEvent.change(input, { target: { value: pasted } });
      expect(input).toHaveValue(pasted);
      expect(
        screen.getByText(
          language === 'es' ? '2.001 / 2.000 caracteres' : '2,001 / 2,000 characters',
        ),
      ).toBeVisible();
      const send = screen.getByRole('button', { name: language === 'es' ? 'Enviar' : 'Send' });
      expect(send).toBeDisabled();
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(interpretTransaction).not.toHaveBeenCalled();
      fireEvent.change(input, { target: { value: 'Gasté 35 mil' } });
      expect(send).toBeEnabled();
      await user.click(send);
      await screen.findByRole('button', { name: language === 'es' ? 'Registrar' : 'Register' });
    },
  );
  it('uses the maximum reported by the backend', async () => {
    vi.mocked(getAiCapabilities).mockResolvedValueOnce({ enabled: true, maxMessageLength: 2500 });
    renderWithProviders(<AiTransactionChat opened onClose={vi.fn()} />);
    await screen.findByText('0 / 2,500 characters');
    fireEvent.change(screen.getByLabelText('Describe your transaction'), {
      target: { value: 'a'.repeat(2200) },
    });
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
  });
});

it('removes selection controls after a filtered collection is fully registered without hiding receipts', async () => {
  const { user, register } = await enterCollection();
  await user.click(screen.getByLabelText('Show only records needing attention'));
  await user.click(register);
  await waitFor(() =>
    expect(useAiChatStore.getState().entries.every((entry) => entry.status === 'confirmed')).toBe(
      true,
    ),
  );
  expect(screen.queryByRole('button', { name: 'Select ready records' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Clear selection' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Show only records needing attention')).not.toBeInTheDocument();
  expect(document.querySelectorAll('[data-batch-row]')).toHaveLength(2);
});
