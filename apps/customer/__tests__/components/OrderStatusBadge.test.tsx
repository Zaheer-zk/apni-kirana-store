import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { OrderStatusBadge } from '@/components/OrderStatusBadge';
import { OrderStatus } from '@aks/shared';

describe('OrderStatusBadge', () => {
  it('renders Pending label for PENDING', () => {
    render(<OrderStatusBadge status={OrderStatus.PENDING} />);
    expect(screen.getByText('Pending')).toBeTruthy();
  });

  it('renders Delivered label for DELIVERED', () => {
    render(<OrderStatusBadge status={OrderStatus.DELIVERED} />);
    expect(screen.getByText('Delivered')).toBeTruthy();
  });

  it('renders Cancelled label for CANCELLED', () => {
    render(<OrderStatusBadge status={OrderStatus.CANCELLED} />);
    expect(screen.getByText('Cancelled')).toBeTruthy();
  });

  it('renders Driver assigned for DRIVER_ASSIGNED', () => {
    render(<OrderStatusBadge status={OrderStatus.DRIVER_ASSIGNED} />);
    expect(screen.getByText('Driver assigned')).toBeTruthy();
  });
});
