import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithProviders } from '../test-utils';
import LoginScreen from '@/app/(auth)/login';

describe('Driver LoginScreen (smoke)', () => {
  it('renders title and phone input', () => {
    renderWithProviders(<LoginScreen />);
    expect(screen.getByText('AKS Driver')).toBeTruthy();
    expect(screen.getByPlaceholderText('Enter your phone number')).toBeTruthy();
  });

  it('shows Send OTP button', () => {
    renderWithProviders(<LoginScreen />);
    expect(screen.getByText('Send OTP')).toBeTruthy();
  });

  it('updates phone input value', () => {
    renderWithProviders(<LoginScreen />);
    const input = screen.getByPlaceholderText('Enter your phone number');
    fireEvent.changeText(input, '9999988888');
    expect(input.props.value).toBe('9999988888');
  });
});
