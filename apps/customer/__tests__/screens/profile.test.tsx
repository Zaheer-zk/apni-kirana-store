import React from 'react';
import { screen } from '@testing-library/react-native';
import { renderWithProviders } from '../test-utils';
import ProfileScreen from '@/app/(tabs)/profile';
import { useAuthStore } from '@/store/auth.store';
import { UserRole } from '@aks/shared';

describe('ProfileScreen (smoke)', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: {
        id: 'u1',
        name: 'Test User',
        phone: '9999900000',
        role: UserRole.CUSTOMER,
      } as any,
      accessToken: 'tkn',
    });
  });

  it('renders user info', () => {
    renderWithProviders(<ProfileScreen />);
    expect(screen.getByText('Test User')).toBeTruthy();
    expect(screen.getByText('9999900000')).toBeTruthy();
  });

  it('renders Log out button', () => {
    renderWithProviders(<ProfileScreen />);
    expect(screen.getByText('Log out')).toBeTruthy();
  });
});
