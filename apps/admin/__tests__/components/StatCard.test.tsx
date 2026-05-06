import React from 'react';
import { render, screen } from '@testing-library/react';
import StatCard from '@/components/StatCard';

describe('StatCard', () => {
  it('renders label and value', () => {
    render(<StatCard icon={<span />} label="Total Orders" value={42} />);
    expect(screen.getByText('Total Orders')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('does not render trend if absent', () => {
    render(<StatCard icon={<span />} label="Sales" value="₹1000" />);
    expect(screen.queryByText('%')).not.toBeInTheDocument();
  });

  it('renders trend percent when provided', () => {
    render(
      <StatCard
        icon={<span />}
        label="Sales"
        value="₹1000"
        trend={{ direction: 'up', percent: 12 }}
      />
    );
    expect(screen.getByText(/12/)).toBeInTheDocument();
  });
});
