import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Button } from '@/components/Button';

describe('Button', () => {
  it('renders title', () => {
    render(<Button title="Press me" />);
    expect(screen.getByText('Press me')).toBeTruthy();
  });

  it('fires onPress when pressed', () => {
    const onPress = jest.fn();
    render(<Button title="Tap" onPress={onPress} />);
    fireEvent.press(screen.getByText('Tap'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('shows loading indicator when loading=true', () => {
    const onPress = jest.fn();
    const { queryByText, UNSAFE_getByType } = render(
      <Button title="Submit" loading onPress={onPress} />
    );
    expect(queryByText('Submit')).toBeNull();
    // ActivityIndicator should be present
    const { ActivityIndicator } = require('react-native');
    expect(UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
  });
});
