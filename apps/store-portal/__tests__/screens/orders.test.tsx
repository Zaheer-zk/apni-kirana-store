import React from 'react';
import { screen } from '@testing-library/react-native';
import { renderWithProviders } from '../test-utils';
import OrdersScreen from '@/app/(tabs)/orders';

describe('Store OrdersScreen (smoke)', () => {
  it('renders Incoming/Active/Completed tabs', () => {
    renderWithProviders(<OrdersScreen />);
    expect(screen.getByText('Incoming')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText('Completed')).toBeTruthy();
  });
});
