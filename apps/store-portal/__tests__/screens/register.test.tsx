import React from 'react';
import { screen } from '@testing-library/react-native';
import { renderWithProviders } from '../test-utils';
import RegisterScreen from '@/app/(auth)/register';

describe('Store RegisterScreen (smoke)', () => {
  it('renders title and Store Name field', () => {
    renderWithProviders(<RegisterScreen />);
    expect(screen.getByText('Register Your Store')).toBeTruthy();
    expect(screen.getByPlaceholderText('e.g. Sharma Kirana Store')).toBeTruthy();
  });

  it('renders Category and Address sections', () => {
    renderWithProviders(<RegisterScreen />);
    expect(screen.getByText(/Category/)).toBeTruthy();
    expect(screen.getByText('Address')).toBeTruthy();
  });

  it('renders pincode and street fields', () => {
    renderWithProviders(<RegisterScreen />);
    expect(screen.getByPlaceholderText('6-digit pincode')).toBeTruthy();
    expect(
      screen.getByPlaceholderText('Shop number, building, street name')
    ).toBeTruthy();
  });
});
