import React from 'react';
import { render, screen } from '@testing-library/react';
import StatusBadge from '@/components/StatusBadge';
import { OrderStatus, StoreStatus, DriverStatus } from '@aks/shared';

describe('StatusBadge', () => {
  it('renders correct label for OrderStatus.PENDING with amber classes', () => {
    const { container } = render(<StatusBadge status={OrderStatus.PENDING} />);
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(container.firstChild).toHaveClass('text-amber-700');
  });

  it('renders Delivered with green classes', () => {
    const { container } = render(<StatusBadge status={OrderStatus.DELIVERED} />);
    expect(screen.getByText('Delivered')).toBeInTheDocument();
    expect(container.firstChild).toHaveClass('text-green-700');
  });

  it('renders Active for StoreStatus.ACTIVE', () => {
    render(<StatusBadge status={StoreStatus.ACTIVE} />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders Online with teal classes for DriverStatus.ONLINE', () => {
    const { container } = render(<StatusBadge status={DriverStatus.ONLINE} />);
    expect(screen.getByText('Online')).toBeInTheDocument();
    expect(container.firstChild).toHaveClass('text-teal-700');
  });
});
