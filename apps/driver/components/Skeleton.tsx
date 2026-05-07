import { useEffect, useRef, useState } from 'react';
import { Animated, DimensionValue, StyleSheet, View, ViewStyle } from 'react-native';
import { colors } from '@/constants/theme';

interface SkeletonProps {
  width?: DimensionValue;
  height?: DimensionValue;
  radius?: number;
  style?: ViewStyle;
}

/**
 * Shimmer skeleton: a base placeholder bar with a translucent highlight that
 * sweeps across it on a loop. Looks alive even before content lands.
 */
export function Skeleton({ width = '100%', height = 16, radius = 8, style }: Readonly<SkeletonProps>) {
  const translate = useRef(new Animated.Value(-1)).current;
  const [layoutWidth, setLayoutWidth] = useState(0);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(translate, {
        toValue: 1,
        duration: 1400,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [translate]);

  const sweepWidth = layoutWidth || 200;
  const translateX = translate.interpolate({
    inputRange: [-1, 1],
    outputRange: [-sweepWidth, sweepWidth],
  });

  return (
    <View
      style={[
        styles.base,
        { width, height, borderRadius: radius },
        style,
      ]}
      onLayout={(e) => setLayoutWidth(e.nativeEvent.layout.width)}
    >
      <Animated.View
        style={[
          styles.sweep,
          {
            width: sweepWidth,
            transform: [{ translateX }],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.gray200,
    overflow: 'hidden',
  },
  sweep: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.55)',
  },
});
