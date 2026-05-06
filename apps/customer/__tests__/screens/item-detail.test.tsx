import React from 'react';
import { screen, waitFor } from '@testing-library/react-native';
import axios from 'axios';
import { renderWithProviders } from '../test-utils';
import ItemDetailScreen from '@/app/item/[id]';
import { ItemCategory, StoreStatus } from '@aks/shared';

jest.mock('expo-router', () => {
  const actual = jest.requireActual('expo-router');
  return {
    ...actual,
    useLocalSearchParams: () => ({ id: 'item-1' }),
  };
});

describe('ItemDetailScreen (smoke)', () => {
  beforeEach(() => {
    const mockItem = {
      id: 'item-1',
      name: 'Basmati Rice',
      price: 250,
      unit: '1kg',
      category: ItemCategory.GROCERY,
      isAvailable: true,
      storeId: 's1',
    };
    const mockStore = {
      id: 's1',
      name: 'Kirana Co',
      category: ItemCategory.GROCERY,
      rating: 4.5,
      status: StoreStatus.ACTIVE,
    };
    const instance: any = (axios as any).create();
    instance.get.mockImplementation(async (url: string) => {
      if (url.includes('/items/item-1')) {
        return { data: { item: mockItem, store: mockStore, distanceKm: 1.2 } };
      }
      return { data: { success: true, data: [] } };
    });
  });

  it('renders item name and price', async () => {
    renderWithProviders(<ItemDetailScreen />);
    await waitFor(() => expect(screen.getByText('Basmati Rice')).toBeTruthy());
    expect(screen.getByText('₹250')).toBeTruthy();
  });

  it('renders Add to Cart button', async () => {
    renderWithProviders(<ItemDetailScreen />);
    await waitFor(() => expect(screen.getByText(/Add to Cart/i)).toBeTruthy());
  });
});
