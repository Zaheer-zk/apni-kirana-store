import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithProviders } from '../test-utils';
import LoginScreen from '@/app/(auth)/login';

describe('Store LoginScreen (smoke)', () => {
  it('renders title and Send OTP button', () => {
    renderWithProviders(<LoginScreen />);
    expect(screen.getByText('AKS Store')).toBeTruthy();
    expect(screen.getByText('Send OTP')).toBeTruthy();
  });

  it('updates phone input', () => {
    renderWithProviders(<LoginScreen />);
    const input = screen.getByPlaceholderText('Enter your phone number');
    fireEvent.changeText(input, '9999900000');
    expect(input.props.value).toBe('9999900000');
  });
});
