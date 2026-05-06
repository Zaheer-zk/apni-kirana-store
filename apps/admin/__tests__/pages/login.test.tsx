import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';
import LoginPage from '@/app/login/page';

describe('Admin LoginPage (smoke)', () => {
  it('renders Send OTP button and phone input', () => {
    renderWithProviders(<LoginPage />);
    expect(screen.getByText('Send OTP')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('9999999999')).toBeInTheDocument();
  });

  it('shows admin hint text with default code', () => {
    renderWithProviders(<LoginPage />);
    expect(screen.getByText(/9999999999/)).toBeInTheDocument();
  });

  it('updates phone field on type', () => {
    renderWithProviders(<LoginPage />);
    const input = screen.getByPlaceholderText('9999999999') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '9999999999' } });
    expect(input.value).toBe('9999999999');
  });
});
