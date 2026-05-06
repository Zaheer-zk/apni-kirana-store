import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';
import DashboardPage from '@/app/(dashboard)/page';

describe('Admin DashboardPage (smoke)', () => {
  it('renders Dashboard title', () => {
    renderWithProviders(<DashboardPage />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('renders stat cards (loading or rendered)', async () => {
    renderWithProviders(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByText(/Orders/)).toBeInTheDocument();
    });
  });

  it('renders Orders Last 7 Days chart header', () => {
    renderWithProviders(<DashboardPage />);
    expect(screen.getByText(/Orders — Last 7 Days/i)).toBeInTheDocument();
  });
});
