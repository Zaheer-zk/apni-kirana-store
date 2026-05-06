import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithProviders } from '../test-utils';
import InventoryScreen from '@/app/(tabs)/inventory';

describe('Store InventoryScreen (smoke)', () => {
  it('renders header and search input', () => {
    renderWithProviders(<InventoryScreen />);
    expect(screen.getByText('Inventory')).toBeTruthy();
    expect(screen.getByPlaceholderText('Search items...')).toBeTruthy();
  });

  it('renders FAB add button', () => {
    renderWithProviders(<InventoryScreen />);
    expect(screen.getByText('+')).toBeTruthy();
  });

  it('updates search on type', () => {
    renderWithProviders(<InventoryScreen />);
    const input = screen.getByPlaceholderText('Search items...');
    fireEvent.changeText(input, 'rice');
    expect(input.props.value).toBe('rice');
  });
});
