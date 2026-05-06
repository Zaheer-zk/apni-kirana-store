import React from 'react';
import { screen } from '@testing-library/react-native';
import { renderWithProviders } from '../test-utils';
import EarningsScreen from '@/app/(tabs)/earnings';

describe('Driver EarningsScreen (smoke)', () => {
  it('renders page title', () => {
    renderWithProviders(<EarningsScreen />);
    expect(screen.getByText('Earnings')).toBeTruthy();
  });

  it('renders Today, This Week, This Month sections', () => {
    renderWithProviders(<EarningsScreen />);
    expect(screen.getByText(/Today/i)).toBeTruthy();
    expect(screen.getByText('This Week')).toBeTruthy();
    expect(screen.getByText('This Month')).toBeTruthy();
  });
});
