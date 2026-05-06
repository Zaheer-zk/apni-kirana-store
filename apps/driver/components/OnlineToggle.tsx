import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useDriverStore } from '@/store/driver.store';
import { colors, fontSize, radius, shadow, spacing } from '@/constants/theme';

interface ToggleStatusResponse {
  isOnline: boolean;
}

export function OnlineToggle() {
  const { isOnline, setOnline } = useDriverStore();

  // Animated value: 0 = offline, 1 = online
  const anim = useRef(new Animated.Value(isOnline ? 1 : 0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  // Subtle pulse on the status indicator when online.
  useEffect(() => {
    if (!isOnline) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isOnline, pulse]);

  const toggleMutation = useMutation<ToggleStatusResponse, Error, boolean>({
    mutationFn: (online: boolean) =>
      api
        .put<ToggleStatusResponse>('/api/v1/drivers/status', {
          status: online ? 'ONLINE' : 'OFFLINE',
        })
        .then((r) => r.data),
    onMutate: (online) => {
      setOnline(online);
      Animated.spring(anim, {
        toValue: online ? 1 : 0,
        useNativeDriver: false,
        friction: 6,
      }).start();
    },
    onError: (err, online) => {
      setOnline(!online);
      Animated.spring(anim, {
        toValue: online ? 0 : 1,
        useNativeDriver: false,
        friction: 6,
      }).start();
      Alert.alert('Error', err.message || 'Could not update status');
    },
  });

  const trackBackground = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.gray300, colors.accent],
  });

  const thumbTranslate = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [4, TRACK_WIDTH - THUMB_SIZE - 4],
  });

  const pulseScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.6],
  });

  const pulseOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.4, 0],
  });

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => toggleMutation.mutate(!isOnline)}
      disabled={toggleMutation.isPending}
      style={[styles.container, isOnline ? styles.containerOnline : null]}
    >
      <View style={styles.left}>
        <View style={styles.iconWrap}>
          {isOnline ? (
            <View style={styles.dotWrap}>
              <Animated.View
                style={[
                  styles.dotPulse,
                  { transform: [{ scale: pulseScale }], opacity: pulseOpacity },
                ]}
              />
              <View style={styles.dot} />
            </View>
          ) : (
            <Ionicons name="moon-outline" size={20} color={colors.gray500} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={[
              styles.statusLabel,
              isOnline ? styles.labelOnline : styles.labelOffline,
            ]}
          >
            {isOnline ? 'You are ONLINE' : 'You are OFFLINE'}
          </Text>
          <Text style={styles.statusHint}>
            {isOnline
              ? 'Tap to go offline and stop receiving orders'
              : 'Tap to go online and start receiving orders'}
          </Text>
        </View>
      </View>

      <Animated.View style={[styles.track, { backgroundColor: trackBackground }]}>
        {toggleMutation.isPending ? (
          <ActivityIndicator
            color={colors.white}
            size="small"
            style={styles.loadingIndicator}
          />
        ) : (
          <Animated.View
            style={[
              styles.thumb,
              { transform: [{ translateX: thumbTranslate }] },
            ]}
          />
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}

const TRACK_WIDTH = 64;
const THUMB_SIZE = 28;

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadow.medium,
  },
  containerOnline: {
    borderColor: colors.accentLight,
    backgroundColor: '#F0FDF4',
  },
  left: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotWrap: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.accent,
  },
  dotPulse: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.accent,
  },
  track: {
    width: TRACK_WIDTH,
    height: THUMB_SIZE + 8,
    borderRadius: (THUMB_SIZE + 8) / 2,
    justifyContent: 'center',
    flexShrink: 0,
  },
  thumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: colors.white,
    ...shadow.small,
  },
  loadingIndicator: { alignSelf: 'center' },
  statusLabel: { fontSize: fontSize.md, fontWeight: '800', marginBottom: 2 },
  labelOnline: { color: colors.accentDark },
  labelOffline: { color: colors.gray700 },
  statusHint: { fontSize: fontSize.xs, color: colors.textMuted, lineHeight: 16 },
});
