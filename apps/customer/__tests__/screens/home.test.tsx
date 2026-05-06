import React from 'react';
import { screen } from '@testing-library/react-native';
import { renderWithProviders } from '../test-utils';
import HomeScreen from '@/app/(tabs)/home';

describe('HomeScreen (smoke)', () => {
  it('renders without crashing and shows section headers', () => {
    renderWithProviders(<HomeScreen />);
    expect(screen.getByText('Stores near you')).toBeTruthy();
    expect(screen.getByText('Shop by Category')).toBeTruthy();
  });

  it('shows search placeholder', () => {
    renderWithProviders(<HomeScreen />);
    expect(screen.getByText(/Search for items/i)).toBeTruthy();
  });
});
