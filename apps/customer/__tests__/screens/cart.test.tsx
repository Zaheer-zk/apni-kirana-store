import React from 'react';
import { screen } from '@testing-library/react-native';
import { renderWithProviders } from '../test-utils';
import CartScreen from '@/app/cart';
import { useCartStore } from '@/store/cart.store';

describe('CartScreen (smoke)', () => {
  afterEach(() => {
    useCartStore.setState({ items: [] });
  });

  it('shows empty state when cart is empty', () => {
    useCartStore.setState({ items: [] });
    renderWithProviders(<CartScreen />);
    expect(screen.getByText(/Your cart is empty/i)).toBeTruthy();
  });

  it('shows bill summary and place order when cart has items', () => {
    useCartStore.setState({
      items: [
        { itemId: 'i1', name: 'Rice', price: 100, unit: '1kg', qty: 2 } as any,
      ],
    });
    renderWithProviders(<CartScreen />);
    expect(screen.getByText('Bill Summary')).toBeTruthy();
    expect(screen.getByText(/Place Order/i)).toBeTruthy();
  });
});
