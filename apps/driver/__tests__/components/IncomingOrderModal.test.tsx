import React from 'react';
import { screen, waitFor } from '@testing-library/react-native';
import axios from 'axios';
import { renderWithProviders } from '../test-utils';
import { IncomingOrderModal } from '@/components/IncomingOrderModal';

describe('IncomingOrderModal (smoke)', () => {
  beforeEach(() => {
    const instance: any = (axios as any).create();
    instance.get.mockImplementation(async (url: string) => {
      if (url.includes('/preview')) {
        return {
          data: {
            id: 'o1',
            pickupAddress: '123 Pickup St',
            deliveryAddress: '456 Drop St',
            pickupDistanceKm: 1.2,
            deliveryDistanceKm: 2.4,
            estimatedEarnings: 80,
            itemsCount: 3,
          },
        };
      }
      return { data: { success: true, data: [] } };
    });
  });

  it('renders New Delivery Request title and Accept/Reject buttons', async () => {
    renderWithProviders(<IncomingOrderModal orderId="o1" />);
    await waitFor(() =>
      expect(screen.getByText(/New Delivery Request/i)).toBeTruthy()
    );
    expect(screen.getByText('Accept')).toBeTruthy();
    expect(screen.getByText('Reject')).toBeTruthy();
  });

  it('shows countdown text with seconds', async () => {
    renderWithProviders(<IncomingOrderModal orderId="o1" />);
    await waitFor(() => expect(screen.getByText(/60s/)).toBeTruthy());
  });
});
