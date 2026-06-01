import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card } from '@/components/Card';
import { colors, fontSize, radius, spacing } from '@/constants/theme';

// Driver-side multi-select for serving zones (matches driver-web's
// ServingZones component). Strict zone enforcement: a driver without any
// selected zone is invisible to the matching engine — we surface this
// prominently when the saved set is empty.

interface Zone {
  id: string;
  name: string;
  city: string;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  isActive: boolean;
}

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    const inner = (payload as { data: unknown }).data;
    if (inner && typeof inner === 'object' && 'data' in inner) {
      return (inner as { data: T }).data;
    }
    return inner as T;
  }
  return payload as T;
}

export default function ZonesScreen() {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<Set<string> | null>(null);

  const allZones = useQuery<Zone[]>({
    queryKey: ['zones', 'public'],
    queryFn: async () => {
      const res = await api.get('/api/v1/zones');
      return unwrap<Zone[]>(res.data);
    },
  });

  const myZones = useQuery<Zone[]>({
    queryKey: ['drivers', 'me', 'zones'],
    queryFn: async () => {
      const res = await api.get('/api/v1/drivers/me/zones');
      return unwrap<Zone[]>(res.data);
    },
  });

  const selected = useMemo(() => {
    if (pending !== null) return pending;
    return new Set((myZones.data ?? []).map((z) => z.id));
  }, [pending, myZones.data]);

  const dirty = pending !== null;

  const save = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selected);
      return api.put('/api/v1/drivers/me/zones', { zoneIds: ids });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drivers', 'me', 'zones'] });
      setPending(null);
      Alert.alert(
        'Saved',
        selected.size === 0
          ? "Zones cleared. You won't receive any offers until you select at least one zone."
          : `Updated — you'll get offers from ${selected.size} zone${selected.size === 1 ? '' : 's'}.`,
      );
    },
    onError: (err) =>
      Alert.alert('Could not save', err instanceof Error ? err.message : 'Try again'),
  });

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPending(next);
  }

  const byCity = useMemo(() => {
    const map = new Map<string, Zone[]>();
    for (const z of allZones.data ?? []) {
      if (!z.isActive) continue;
      const list = map.get(z.city) ?? [];
      list.push(z);
      map.set(z.city, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [allZones.data]);

  const isLoading = allZones.isLoading || myZones.isLoading;
  const showEmptyWarning =
    !myZones.isLoading && (myZones.data?.length ?? 0) === 0 && !dirty;

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Card>
          <View style={styles.header}>
            <Ionicons name="location-outline" size={20} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Serving zones</Text>
              <Text style={styles.subtitle}>
                Pick the zones you want orders from. You must select at least one
                zone — without any selection you won&apos;t receive offers.
              </Text>
            </View>
          </View>

          {showEmptyWarning ? (
            <View style={styles.warn}>
              <Ionicons name="warning-outline" size={16} color={colors.warning} />
              <Text style={styles.warnText}>
                <Text style={{ fontWeight: '700' }}>No zones selected yet.</Text> The
                matching engine can&apos;t offer you orders until you pick at least
                one zone below and save.
              </Text>
            </View>
          ) : null}

          {isLoading ? (
            <ActivityIndicator
              color={colors.primary}
              size="small"
              style={{ marginVertical: spacing.lg }}
            />
          ) : byCity.length === 0 ? (
            <Text style={styles.muted}>
              No zones configured yet. Ask admin to create zones in the dashboard.
            </Text>
          ) : (
            <View style={{ gap: spacing.md }}>
              {byCity.map(([city, zones]) => (
                <View key={city}>
                  <Text style={styles.cityLabel}>{city}</Text>
                  <View style={styles.chipWrap}>
                    {zones.map((z) => {
                      const on = selected.has(z.id);
                      return (
                        <TouchableOpacity
                          key={z.id}
                          onPress={() => toggle(z.id)}
                          activeOpacity={0.8}
                          style={[styles.chip, on ? styles.chipOn : styles.chipOff]}
                        >
                          {on ? (
                            <Ionicons name="checkmark" size={12} color={colors.white} />
                          ) : null}
                          <Text style={[styles.chipText, on ? styles.chipTextOn : null]}>
                            {z.name}
                          </Text>
                          <Text
                            style={[
                              styles.chipMeta,
                              on ? styles.chipMetaOn : null,
                            ]}
                          >
                            {z.radiusKm}km
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>
          )}
        </Card>

        {dirty ? (
          <Card>
            <Text style={styles.dirtyHint}>
              {selected.size === 0
                ? '⚠ Will save: no zones (you stop receiving offers)'
                : `Will save: ${selected.size} zone${selected.size === 1 ? '' : 's'}`}
            </Text>
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.btn, styles.btnGhost]}
                onPress={() => setPending(null)}
                disabled={save.isPending}
              >
                <Text style={styles.btnGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary]}
                onPress={() => save.mutate()}
                disabled={save.isPending}
              >
                {save.isPending ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <Text style={styles.btnPrimaryText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </Card>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1 },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxxl },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  title: { fontSize: fontSize.md, fontWeight: '700', color: colors.textPrimary },
  subtitle: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 4,
    lineHeight: 16,
  },
  warn: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.warningLight,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.warning,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  warnText: { flex: 1, fontSize: fontSize.xs, color: colors.warningDark, lineHeight: 16 },
  muted: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    backgroundColor: colors.gray100,
    padding: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.md,
  },
  cityLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipOff: { backgroundColor: colors.white, borderColor: colors.border },
  chipText: { fontSize: fontSize.xs, fontWeight: '600', color: colors.textPrimary },
  chipTextOn: { color: colors.white },
  chipMeta: { fontSize: 10, color: colors.textMuted, marginLeft: 2 },
  chipMetaOn: { color: 'rgba(255,255,255,0.75)' },
  dirtyHint: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  actions: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end' },
  btn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 96,
  },
  btnGhost: { backgroundColor: colors.gray100 },
  btnGhostText: { fontSize: fontSize.sm, color: colors.textPrimary, fontWeight: '600' },
  btnPrimary: { backgroundColor: colors.primary },
  btnPrimaryText: { fontSize: fontSize.sm, color: colors.white, fontWeight: '700' },
});
