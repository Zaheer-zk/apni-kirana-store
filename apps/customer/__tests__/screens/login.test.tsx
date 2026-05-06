import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithProviders } from '../test-utils';
import LoginScreen from '@/app/(auth)/login';

describe('LoginScreen (smoke)', () => {
  it('renders welcome and brand text', () => {
    renderWithProviders(<LoginScreen />);
    expect(screen.getByText('Apni Kirana Store')).toBeTruthy();
    expect(screen.getByText('Welcome')).toBeTruthy();
  });

  it('shows OTP step after sending OTP with valid phone', async () => {
    renderWithProviders(<LoginScreen />);
    const phoneInput = screen.getByPlaceholderText('9999966661');
    fireEvent.changeText(phoneInput, '9999966661');

    const sendBtn = screen.getByText('Send OTP');
    fireEvent.press(sendBtn);

    // Wait microtasks
    await new Promise((r) => setTimeout(r, 0));
    expect(await screen.findByText('Verify OTP')).toBeTruthy();
  });
});
