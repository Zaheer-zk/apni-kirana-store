import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithProviders } from '../test-utils';
import RegisterScreen from '@/app/(auth)/register';

describe('Driver RegisterScreen (smoke)', () => {
  it('renders Vehicle Type and submit button', () => {
    renderWithProviders(<RegisterScreen />);
    expect(screen.getByText('Vehicle Type')).toBeTruthy();
    expect(screen.getByText('Submit Application')).toBeTruthy();
  });

  it('renders vehicle number input', () => {
    renderWithProviders(<RegisterScreen />);
    expect(screen.getByPlaceholderText('e.g. MH01AB1234')).toBeTruthy();
  });

  it('updates vehicle number on type', () => {
    renderWithProviders(<RegisterScreen />);
    const input = screen.getByPlaceholderText('e.g. MH01AB1234');
    fireEvent.changeText(input, 'MH01AB1234');
    expect(input.props.value).toBe('MH01AB1234');
  });
});
