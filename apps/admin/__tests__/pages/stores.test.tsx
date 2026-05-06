import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';
import StoresPage from '@/app/(dashboard)/stores/page';

describe('Admin StoresPage (smoke)', () => {
  it('renders Pending/Active/Suspended tabs', () => {
    renderWithProviders(<StoresPage />);
    expect(screen.getByText('Pending Approval')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Suspended')).toBeInTheDocument();
  });

  it('renders search input', () => {
    renderWithProviders(<StoresPage />);
    expect(
      screen.getByPlaceholderText(/Search by store name/i)
    ).toBeInTheDocument();
  });
});
