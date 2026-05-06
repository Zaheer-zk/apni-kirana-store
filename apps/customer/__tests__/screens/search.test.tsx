import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithProviders } from '../test-utils';
import SearchScreen from '@/app/(tabs)/search';

describe('SearchScreen (smoke)', () => {
  it('renders search input', () => {
    renderWithProviders(<SearchScreen />);
    expect(screen.getByPlaceholderText('Search items, brands...')).toBeTruthy();
  });

  it('shows trending searches when query is empty', () => {
    renderWithProviders(<SearchScreen />);
    expect(screen.getByText('Trending searches')).toBeTruthy();
  });

  it('updates query input on type', () => {
    renderWithProviders(<SearchScreen />);
    const input = screen.getByPlaceholderText('Search items, brands...');
    fireEvent.changeText(input, 'rice');
    expect(input.props.value).toBe('rice');
  });
});
