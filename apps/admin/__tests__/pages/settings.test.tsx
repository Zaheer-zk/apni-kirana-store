import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';
import SettingsPage from '@/app/(dashboard)/settings/page';

describe('Admin SettingsPage (smoke)', () => {
  it('renders Settings title', () => {
    renderWithProviders(<SettingsPage />);
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('renders Save Settings button', async () => {
    renderWithProviders(<SettingsPage />);
    await waitFor(() =>
      expect(screen.getByText(/Save Settings/i)).toBeInTheDocument()
    );
  });

  it('renders at least one range slider input', async () => {
    const { container } = renderWithProviders(<SettingsPage />);
    await waitFor(() => {
      const sliders = container.querySelectorAll('input[type="range"]');
      expect(sliders.length).toBeGreaterThan(0);
    });
  });
});
