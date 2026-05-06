import React from 'react';
import { screen } from '@testing-library/react-native';
import { renderWithProviders } from '../test-utils';
import ProfileScreen from '@/app/(tabs)/profile';
import { useStorePortalStore } from '@/store/store.store';
import { ItemCategory, StoreStatus, UserRole } from '@aks/shared';

describe('Store ProfileScreen (smoke)', () => {
  beforeEach(() => {
    useStorePortalStore.setState({
      user: { id: 'u1', name: 'Owner Joe', phone: '999', role: UserRole.STORE_OWNER } as any,
      storeProfile: {
        id: 's1',
        name: 'My Kirana',
        category: ItemCategory.GROCERY,
        status: StoreStatus.ACTIVE,
        isOpen: true,
        openingTime: '09:00',
        closingTime: '21:00',
        address: { street: 'Main', city: 'Delhi', state: 'DL', pincode: '110001' },
        rating: 4.5,
      } as any,
      accessToken: 'tkn',
      incomingOrderId: null,
    });
  });

  it('renders store name and Logout button', () => {
    renderWithProviders(<ProfileScreen />);
    expect(screen.getAllByText('My Kirana').length).toBeGreaterThan(0);
    expect(screen.getByText('Logout')).toBeTruthy();
  });
});
