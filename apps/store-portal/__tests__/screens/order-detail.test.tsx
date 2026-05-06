import React from 'react';
import { screen, waitFor } from '@testing-library/react-native';
import axios from 'axios';
import { renderWithProviders } from '../test-utils';
import OrderDetailScreen from '@/app/order/[id]';

jest.mock('expo-router', () => {
  const actual = jest.requireActual('expo-router');
  return {
    ...actual,
    useLocalSearchParams: () => ({ id: 'o1' }),
  };
});

describe('Store OrderDetailScreen (smoke)', () => {
  beforeEach(() => {
    const mockOrder = {
      id: 'o1',
      status: 'PENDING',
      items: [
        { itemId: 'i1', name: 'Rice', qty: 2, unit: '1kg', price: 100 },
      ],
      customerName: 'John',
      customerPhone: '999',
      total: 200,
      subtotal: 200,
      deliveryFee: 0,
      address: { line1: '1 St', city: 'Delhi', pincode: '110001' },
      statusTimeline: [{ status: 'PENDING', timestamp: new Date().toISOString() }],
    };
    const instance: any = (axios as any).create();
    instance.get.mockImplementation(async (url: string) => {
      if (url.includes('/orders/o1')) return { data: mockOrder };
      return { data: { success: true, data: [] } };
    });
  });

  it('renders Items section and Accept/Reject when PENDING', async () => {
    renderWithProviders(<OrderDetailScreen />);
    await waitFor(() => expect(screen.getByText('Items')).toBeTruthy());
    expect(screen.getByText('Accept Order')).toBeTruthy();
    expect(screen.getByText('Reject Order')).toBeTruthy();
  });
});
