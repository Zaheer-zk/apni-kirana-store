import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Switch } from 'react-native';
import { InventoryItem } from '@/components/InventoryItem';

const baseItem: any = {
  id: 'i1',
  name: 'Tata Salt 1kg',
  unit: '1kg',
  category: 'GROCERY',
  price: 25.5,
  stockQty: 10,
  available: true,
};

describe('InventoryItem', () => {
  it('renders item name and price', () => {
    render(
      <InventoryItem
        item={baseItem}
        onToggleAvailability={jest.fn()}
        onEdit={jest.fn()}
        onDelete={jest.fn()}
      />
    );
    expect(screen.getByText('Tata Salt 1kg')).toBeTruthy();
    expect(screen.getByText('₹25.50')).toBeTruthy();
  });

  it('reveals Edit and Delete swipe actions in DOM', () => {
    render(
      <InventoryItem
        item={baseItem}
        onToggleAvailability={jest.fn()}
        onEdit={jest.fn()}
        onDelete={jest.fn()}
      />
    );
    expect(screen.getByText('Edit')).toBeTruthy();
    expect(screen.getByText('Delete')).toBeTruthy();
  });

  it('calls onToggleAvailability when switch toggled', () => {
    const onToggle = jest.fn();
    const { UNSAFE_getByType } = render(
      <InventoryItem
        item={baseItem}
        onToggleAvailability={onToggle}
        onEdit={jest.fn()}
        onDelete={jest.fn()}
      />
    );
    const sw = UNSAFE_getByType(Switch);
    fireEvent(sw, 'valueChange', false);
    expect(onToggle).toHaveBeenCalledWith(false);
  });
});
