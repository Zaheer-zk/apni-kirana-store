import React from 'react';
import { screen } from '@testing-library/react-native';
import { renderWithProviders } from '../test-utils';
import AddItemScreen from '@/app/inventory/add';

describe('Inventory Add screen (smoke)', () => {
  it('renders form fields', () => {
    renderWithProviders(<AddItemScreen />);
    expect(screen.getByPlaceholderText('e.g. Tata Salt 1kg')).toBeTruthy();
    expect(screen.getByPlaceholderText('0.00')).toBeTruthy();
    expect(screen.getByPlaceholderText('0')).toBeTruthy();
  });

  it('renders Add Item submit button', () => {
    renderWithProviders(<AddItemScreen />);
    expect(screen.getByText('Add Item')).toBeTruthy();
  });
});
