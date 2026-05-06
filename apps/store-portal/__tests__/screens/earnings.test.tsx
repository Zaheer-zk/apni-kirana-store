import React from 'react';
import { screen } from '@testing-library/react-native';
import { renderWithProviders } from '../test-utils';
import EarningsScreen from '@/app/(tabs)/earnings';

describe('Store EarningsScreen (smoke)', () => {
  it('renders Earnings page title', () => {
    renderWithProviders(<EarningsScreen />);
    expect(screen.getByText('Earnings')).toBeTruthy();
  });

  it('renders weekly and monthly summary labels', () => {
    renderWithProviders(<EarningsScreen />);
    expect(screen.getByText('This Week')).toBeTruthy();
    expect(screen.getByText('This Month')).toBeTruthy();
  });
});
