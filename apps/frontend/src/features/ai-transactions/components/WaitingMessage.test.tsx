import { act, screen, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { WaitingMessage } from './WaitingMessage';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it('keeps ordinary waits neutral and offers extra guidance only after 75 seconds', () => {
  vi.useFakeTimers();
  renderWithProviders(<WaitingMessage />, { language: 'es' });
  expect(screen.getByText('Estamos preparando tus registros…')).toBeVisible();
  act(() => vi.advanceTimersByTime(30000));
  expect(screen.queryByText(/Seguimos preparando tus registros/)).not.toBeInTheDocument();
  act(() => vi.advanceTimersByTime(44999));
  expect(screen.queryByText(/Seguimos preparando tus registros/)).not.toBeInTheDocument();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.getByText(/Seguimos preparando tus registros/)).toBeVisible();
});
