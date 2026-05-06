import React from 'react';
import { screen, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../test-utils';
import DeliveriesScreen from '@/app/(tabs)/deliveries';

describe('Driver DeliveriesScreen (smoke)', () => {
  it('renders empty state when no deliveries', async () => {
    renderWithProviders(<DeliveriesScreen />);
    await waitFor(() => expect(screen.getByText(/No deliveries yet/i)).toBeTruthy());
  });
});
