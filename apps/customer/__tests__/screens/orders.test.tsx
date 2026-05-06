import React from 'react';
import { screen } from '@testing-library/react-native';
import { renderWithProviders } from '../test-utils';
import OrdersScreen from '@/app/(tabs)/orders';

describe('OrdersScreen (smoke)', () => {
  it('renders Active and Past tabs', () => {
    renderWithProviders(<OrdersScreen />);
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText('Past')).toBeTruthy();
  });

  it('shows empty state when there are no orders', async () => {
    renderWithProviders(<OrdersScreen />);
    expect(await screen.findByText(/No active orders/i)).toBeTruthy();
  });
});
