import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ItemCard } from '@/components/ItemCard';
import { ItemCategory } from '@aks/shared';
import { useCartStore } from '@/store/cart.store';

const mockItem = {
  id: 'i1',
  name: 'Atta 5kg',
  price: 280,
  unit: '5kg',
  category: ItemCategory.GROCERY,
  isAvailable: true,
  storeId: 's1',
} as any;

describe('ItemCard', () => {
  beforeEach(() => {
    useCartStore.setState({ items: [] });
  });

  it('renders item name and price', () => {
    render(<ItemCard item={mockItem} />);
    expect(screen.getByText('Atta 5kg')).toBeTruthy();
    expect(screen.getByText('₹280')).toBeTruthy();
  });

  it('shows Add button when not in cart', () => {
    render(<ItemCard item={mockItem} />);
    expect(screen.getByText('Add')).toBeTruthy();
  });

  it('adds to cart and switches to qty stepper on press', () => {
    render(<ItemCard item={mockItem} />);
    fireEvent.press(screen.getByText('Add'));
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(useCartStore.getState().items[0].qty).toBe(1);
  });
});
