import React from 'react';
import { render, screen } from '@testing-library/react';
import Sidebar from '@/components/Sidebar';

describe('Sidebar', () => {
  it('renders all nav links', () => {
    render(<Sidebar />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Stores')).toBeInTheDocument();
    expect(screen.getByText('Drivers')).toBeInTheDocument();
    expect(screen.getByText('Orders')).toBeInTheDocument();
    expect(screen.getByText('Users')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('renders Sign out button', () => {
    render(<Sidebar />);
    expect(screen.getByText('Sign out')).toBeInTheDocument();
  });

  it('renders brand label', () => {
    render(<Sidebar />);
    expect(screen.getByText('Apni Kirana')).toBeInTheDocument();
  });
});
