import React from 'react';
import { screen, waitFor } from '@testing-library/react-native';
import axios from 'axios';
import { renderWithProviders } from '../test-utils';
import { IncomingOrderBanner } from '@/components/IncomingOrderBanner';

describe('IncomingOrderBanner (smoke)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    const instance: any = (axios as any).create();
    instance.get.mockImplementation(async (url: string) => {
      if (url.includes('/preview')) {
        return {
          data: {
            id: 'o1',
            itemsCount: 3,
            orderTotal: 250,
            customerName: 'John',
          },
        };
      }
      return { data: { success: true, data: [] } };
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders New Order title and Accept/Reject buttons', async () => {
    renderWithProviders(<IncomingOrderBanner orderId="o1" />);
    await waitFor(() => expect(screen.getByText(/New Order/i)).toBeTruthy());
    expect(screen.getByText('Accept Order')).toBeTruthy();
    expect(screen.getByText('Reject')).toBeTruthy();
  });

  it('renders countdown in MM:SS format starting at 03:00', () => {
    renderWithProviders(<IncomingOrderBanner orderId="o1" />);
    expect(screen.getByText('03:00')).toBeTruthy();
  });
});
