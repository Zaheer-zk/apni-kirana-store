import React from 'react';
import { screen } from '@testing-library/react-native';
import { renderWithProviders } from '../test-utils';
import DashboardScreen from '@/app/(tabs)/dashboard';
import { useDriverStore } from '@/store/driver.store';
import { UserRole } from '@aks/shared';

describe('Driver DashboardScreen (smoke)', () => {
  beforeEach(() => {
    useDriverStore.setState({
      user: { id: 'u1', name: 'Test', phone: '999', role: UserRole.DRIVER } as any,
      driverProfile: null,
      accessToken: 'tkn',
      isOnline: false,
      activeOrderId: null,
      incomingOrderId: null,
    });
  });

  it('renders dashboard header and online status', () => {
    renderWithProviders(<DashboardScreen />);
    expect(screen.getByText('Driver Dashboard')).toBeTruthy();
    expect(screen.getByText('Offline')).toBeTruthy();
  });

  it('renders today stats labels', () => {
    renderWithProviders(<DashboardScreen />);
    expect(screen.getByText(/Deliveries/i)).toBeTruthy();
    expect(screen.getByText(/Earnings/i)).toBeTruthy();
  });
});
