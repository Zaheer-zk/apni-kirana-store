import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useDriverStore } from '@/store/driver.store';

interface ToggleStatusResponse {
  isOnline: boolean;
}

export function OnlineToggle() {
  const { isOnline, setOnline } = useDriverStore();

  // Animated value: 0 = offline, 1 = online
  const anim = useRef(new Animated.Value(isOnline ? 1 : 0)).current;

  const toggleMutation = useMutation<ToggleStatusResponse, Error, boolean>({
    mutationFn: (online: boolean) =>
      api
        .put<ToggleStatusResponse>('/api/v1/drivers/status', {
          status: online ? 'ONLINE' : 'OFFLINE',
        })
        .then((r) => r.data),
    onMutate: (online) => {
      // Optimistic update
      setOnline(online);
      Animated.spring(anim, {
        toValue: online ? 1 : 0,
        useNativeDriver: false,
        friction: 6,
      }).start();
    },
    onError: (err, online) => {
      // Revert
      setOnline(!online);
      Animated.spring(anim, {
        toValue: online ? 0 : 1,
        useNativeDriver: false,
        friction: 6,
      }).start();
      Alert.alert('Error', err.message || 'Could not update status');
    },
  });

  const backgroundColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#DC2626', '#16A34A'],
  });

  const thumbTranslate = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [4, 56],
  });

  return (
    <View style={styles.container}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => toggleMutation.mutate(!isOnline)}
        disabled={toggleMutation.isPending}
        style={styles.touchable}
      >
        <Animated.View style={[styles.track, { backgroundColor }]}>
          {toggleMutation.isPending ? (
            <ActivityIndicator
              color="#fff"
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

        <View style={styles.labelContainer}>
          <Text style={[styles.statusLabel, isOnline ? styles.labelOnline : styles.labelOffline]}>
            {isOnline ? 'You are ONLINE' : 'You are OFFLINE'}
          </Text>
          <Text style={styles.statusHint}>
            {isOnline
              ? 'Tap to go offline and stop receiving orders'
              : 'Tap to go online and start receiving orders'}
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const TRACK_WIDTH = 96;
const THUMB_SIZE = 36;

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  touchable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
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
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  loadingIndicator: {
    alignSelf: 'center',
  },
  labelContainer: { flex: 1 },
  statusLabel: { fontSize: 16, fontWeight: '800', marginBottom: 2 },
  labelOnline: { color: '#16A34A' },
  labelOffline: { color: '#DC2626' },
  statusHint: { fontSize: 12, color: '#9CA3AF' },
});
