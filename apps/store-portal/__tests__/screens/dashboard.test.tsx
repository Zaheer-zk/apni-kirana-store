import React from 'react';
import { screen } from '@testing-library/react-native';
import { renderWithProviders } from '../test-utils';
import DashboardScreen from '@/app/(tabs)/dashboard';
import { useStorePortalStore } from '@/store/store.store';
import { ItemCategory, StoreStatus, UserRole } from '@aks/shared';

describe('Store DashboardScreen (smoke)', () => {
  beforeEach(() => {
    useStorePortalStore.setState({
      user: { id: 'u', name: 'O', phone: '9', role: UserRole.STORE_OWNER } as any,
      storeProfile: {
        id: 's1',
        name: 'My Kirana',
        category: ItemCategory.GROCERY,
        status: StoreStatus.ACTIVE,
        isOpen: false,
        rating: 4.5,
      } as any,
      accessToken: 'tkn',
      incomingOrderId: null,
    });
  });

  it('renders store name', () => {
    renderWithProviders(<DashboardScreen />);
    expect(screen.getByText('My Kirana')).toBeTruthy();
  });

  it('renders Closed status label when not open', () => {
    renderWithProviders(<DashboardScreen />);
    expect(screen.getByText('Closed')).toBeTruthy();
  });

  it('renders Revenue Today section', () => {
    renderWithProviders(<DashboardScreen />);
    expect(screen.getByText(/Revenue/i)).toBeTruthy();
  });
});
