import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { EmptyState } from '@/components/EmptyState';

describe('EmptyState', () => {
  it('renders title and subtitle', () => {
    render(<EmptyState title="Nothing here" subtitle="Come back later" />);
    expect(screen.getByText('Nothing here')).toBeTruthy();
    expect(screen.getByText('Come back later')).toBeTruthy();
  });

  it('renders CTA when actionLabel + onAction provided', () => {
    const onAction = jest.fn();
    render(
      <EmptyState title="Empty" actionLabel="Refresh" onAction={onAction} />
    );
    const cta = screen.getByText('Refresh');
    fireEvent.press(cta);
    expect(onAction).toHaveBeenCalled();
  });

  it('does not render CTA when no action provided', () => {
    render(<EmptyState title="Empty" />);
    expect(screen.queryByText('Refresh')).toBeNull();
  });
});
