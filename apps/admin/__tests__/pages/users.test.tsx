import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';
import UsersPage from '@/app/(dashboard)/users/page';

describe('Admin UsersPage (smoke)', () => {
  it('renders Users title', () => {
    renderWithProviders(<UsersPage />);
    expect(screen.getByText('Users')).toBeInTheDocument();
  });

  it('renders search input', () => {
    renderWithProviders(<UsersPage />);
    expect(
      screen.getByPlaceholderText(/Search by name or phone/i)
    ).toBeInTheDocument();
  });

  it('renders role filter select', () => {
    const { container } = renderWithProviders(<UsersPage />);
    const select = container.querySelector('select');
    expect(select).toBeInTheDocument();
  });
});
