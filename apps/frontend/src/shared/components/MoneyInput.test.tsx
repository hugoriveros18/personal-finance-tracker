import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MoneyInput } from './MoneyInput';
import { renderWithProviders } from '@/test/render';

describe('<MoneyInput />', () => {
  it('renders with empty value when value is null', () => {
    renderWithProviders(<MoneyInput aria-label="amount" value={null} />);
    expect(screen.getByLabelText('amount')).toHaveValue('');
  });

  it('renders an integer-peso amount with fixed 2-decimal scale while editing', () => {
    // 1.250.000 pesos = 125_000_000 centavos. The input always pads to 2 decimals so
    // the cursor doesn't jump while the user types a fractional amount.
    renderWithProviders(<MoneyInput aria-label="amount" value={125_000_000} />);
    expect(screen.getByLabelText('amount')).toHaveValue('$1.250.000,00');
  });

  it('renders a fractional amount with 2 decimals', () => {
    // 1.250.000,50 pesos = 125_000_050 centavos
    renderWithProviders(<MoneyInput aria-label="amount" value={125_000_050} />);
    expect(screen.getByLabelText('amount')).toHaveValue('$1.250.000,50');
  });

  it('emits centavos via onChange when the user types whole pesos', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(<MoneyInput aria-label="amount" onChange={onChange} />);
    await user.type(screen.getByLabelText('amount'), '1500');
    const lastCall = onChange.mock.calls.at(-1)?.[0];
    expect(lastCall).toBe(150_000); // 1.500 pesos in centavos
  });

  it('does not allow negative numbers', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(<MoneyInput aria-label="amount" onChange={onChange} />);
    await user.type(screen.getByLabelText('amount'), '-100');
    const calls = onChange.mock.calls.map((c) => c[0]);
    for (const v of calls) {
      if (typeof v === 'number') expect(v).toBeGreaterThanOrEqual(0);
    }
  });
});
