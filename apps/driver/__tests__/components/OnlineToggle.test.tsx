import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithProviders } from '../test-utils';
import { OnlineToggle } from '@/components/OnlineToggle';
import { useDriverStore } from '@/store/driver.store';

describe('OnlineToggle', () => {
  beforeEach(() => {
    useDriverStore.setState({
      user: null,
      driverProfile: null,
      accessToken: null,
      isOnline: false,
      activeOrderId: null,
      incomingOrderId: null,
    });
  });

  it('renders OFFLINE label initially', () => {
    renderWithProviders(<OnlineToggle />);
    expect(screen.getByText(/You are OFFLINE/i)).toBeTruthy();
  });

  it('flips to ONLINE optimistically on press', () => {
    renderWithProviders(<OnlineToggle />);
    fireEvent.press(screen.getByText(/You are OFFLINE/i));
    expect(useDriverStore.getState().isOnline).toBe(true);
  });
});
