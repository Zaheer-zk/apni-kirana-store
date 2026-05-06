import React from 'react';
import { screen } from '@testing-library/react-native';
import { renderWithProviders } from '../test-utils';
import ProfileScreen from '@/app/(tabs)/profile';
import { useDriverStore } from '@/store/driver.store';
import { UserRole, DriverStatus } from '@aks/shared';

describe('Driver ProfileScreen (smoke)', () => {
  beforeEach(() => {
    useDriverStore.setState({
      user: {
        id: 'u1',
        name: 'Drive Joe',
        phone: '9000011111',
        role: UserRole.DRIVER,
      } as any,
      driverProfile: {
        userId: 'u1',
        vehicleType: 'BIKE',
        vehicleNumber: 'MH01AB1234',
        status: DriverStatus.ACTIVE,
        rating: 4.7,
      } as any,
      accessToken: 'tkn',
      isOnline: false,
      activeOrderId: null,
      incomingOrderId: null,
    });
  });

  it('renders driver name and phone', () => {
    renderWithProviders(<ProfileScreen />);
    expect(screen.getByText('Drive Joe')).toBeTruthy();
    expect(screen.getByText('9000011111')).toBeTruthy();
  });

  it('renders vehicle info and Logout', () => {
    renderWithProviders(<ProfileScreen />);
    expect(screen.getByText('MH01AB1234')).toBeTruthy();
    expect(screen.getByText('Logout')).toBeTruthy();
  });
});
