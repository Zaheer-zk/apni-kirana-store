import React from 'react';
import { screen, waitFor } from '@testing-library/react-native';
import axios from 'axios';
import { renderWithProviders } from '../test-utils';
import OrderTrackingScreen from '@/app/order/[id]';
import { OrderStatus, PaymentMethod, PaymentStatus } from '@aks/shared';

jest.mock('expo-router', () => {
  const actual = jest.requireActual('expo-router');
  return {
    ...actual,
    useLocalSearchParams: () => ({ id: 'order-1' }),
  };
});

describe('OrderTrackingScreen (smoke)', () => {
  beforeEach(() => {
    const mockOrder = {
      id: 'order-1',
      status: OrderStatus.STORE_ACCEPTED,
      total: 350,
      subtotal: 300,
      deliveryFee: 50,
      paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
      paymentStatus: PaymentStatus.PENDING,
      items: [{ itemId: 'i1', name: 'Rice', price: 100, qty: 3, unit: '1kg' }],
      address: { line1: '123 St', city: 'Delhi', pincode: '110001', lat: 28.6, lng: 77.2 },
      createdAt: new Date().toISOString(),
    };
    const instance: any = (axios as any).create();
    instance.get.mockImplementation(async (url: string) => {
      if (url.includes('/orders/order-1')) {
        return { data: { order: mockOrder } };
      }
      return { data: { success: true, data: [] } };
    });
  });

  it('renders order status and step labels', async () => {
    renderWithProviders(<OrderTrackingScreen />);
    await waitFor(() => expect(screen.getByText('Accepted')).toBeTruthy());
    expect(screen.getByText('Placed')).toBeTruthy();
    expect(screen.getByText('Delivered')).toBeTruthy();
  });
});
