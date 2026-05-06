import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';
import OrdersPage from '@/app/(dashboard)/orders/page';

describe('Admin OrdersPage (smoke)', () => {
  it('renders Orders title and Filters label', () => {
    renderWithProviders(<OrdersPage />);
    expect(screen.getByText('Orders')).toBeInTheDocument();
    expect(screen.getByText('Filters')).toBeInTheDocument();
  });

  it('renders status select with All Statuses option', () => {
    renderWithProviders(<OrdersPage />);
    expect(screen.getByText('All Statuses')).toBeInTheDocument();
  });

  it('renders date inputs', () => {
    const { container } = renderWithProviders(<OrdersPage />);
    const dateInputs = container.querySelectorAll('input[type="date"]');
    expect(dateInputs.length).toBeGreaterThanOrEqual(2);
  });
});
