import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { EmptyState } from './EmptyState';
import { renderWithProviders } from '@/test/render';

describe('<EmptyState />', () => {
  it('renders the title', () => {
    renderWithProviders(<EmptyState title="No data" />);
    expect(screen.getByText('No data')).toBeInTheDocument();
  });

  it('renders an optional description', () => {
    renderWithProviders(<EmptyState title="Empty" description="Nothing here yet" />);
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
  });

  it('renders a custom action element', () => {
    renderWithProviders(
      <EmptyState title="Empty" action={<button>Create</button>} />,
    );
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
  });
});
