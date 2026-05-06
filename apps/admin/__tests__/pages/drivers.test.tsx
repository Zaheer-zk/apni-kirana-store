import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';
import DriversPage from '@/app/(dashboard)/drivers/page';

describe('Admin DriversPage (smoke)', () => {
  it('renders Pending/Active/Suspended tabs', () => {
    renderWithProviders(<DriversPage />);
    expect(screen.getByText('Pending Approval')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Suspended')).toBeInTheDocument();
  });

  it('renders search input', () => {
    renderWithProviders(<DriversPage />);
    expect(
      screen.getByPlaceholderText(/Search by name or phone/i)
    ).toBeInTheDocument();
  });
});
