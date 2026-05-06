import { Ionicons } from '@expo/vector-icons';
import { useHeaderHeight } from '@react-navigation/elements';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useCallback, useMemo } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/Skeleton';
import { apiClient } from '@/lib/api';
import { colors, fontSize, radius, spacing } from '@/constants/theme';

// ─── Types ──────────────────────────────────────────────────────────────────
export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  body: string;
  data?: Record<string, unknown> | null;
  isRead: boolean;
  createdAt: string;
}

interface NotificationsResponse {
  notifications: AppNotification[];
  total?: number;
  page?: number;
  limit?: number;
  pages?: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - then) / 1000));

  if (diffSec < 30) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return '';
  }
}

type IoniconName = keyof typeof Ionicons.glyphMap;

interface IconBundle {
  icon: IoniconName;
  bg: string;
  fg: string;
}

function pickIcon(n: AppNotification): IconBundle {
  const event =
    typeof n.data?.event === 'string' ? (n.data.event as string).toLowerCase() : '';
  const title = (n.title ?? '').toLowerCase();
  const haystack = `${event} ${title}`;

  if (/promo|coupon|discount|offer/.test(haystack)) {
    return {
      icon: 'pricetag-outline',
      bg: colors.warningLight,
      fg: colors.warning,
    };
  }
  if (/approv|admin|verif|kyc|review/.test(haystack)) {
    return {
      icon: 'shield-checkmark-outline',
      bg: colors.indigoLight,
      fg: colors.indigo,
    };
  }
  if (/driver|delivery|on the way|en.route|navigate/.test(haystack)) {
    return {
      icon: 'bicycle-outline',
      bg: colors.errorLight,
      fg: colors.error,
    };
  }
  if (/store|merchant|shop/.test(haystack)) {
    return {
      icon: 'storefront-outline',
      bg: colors.infoLight,
      fg: colors.info,
    };
  }
  if (/order|receipt|placed|accepted|picked|delivered|cancel/.test(haystack)) {
    return {
      icon: 'bag-handle-outline',
      bg: colors.primaryLight,
      fg: colors.primary,
    };
  }
  return {
    icon: 'notifications-outline',
    bg: colors.gray100,
    fg: colors.gray600,
  };
}

// ─── API ────────────────────────────────────────────────────────────────────
export async function fetchNotifications(): Promise<AppNotification[]> {
  try {
    const res = await apiClient.get('/api/v1/notifications');
    const payload = res.data;
    if (Array.isArray(payload)) return payload as AppNotification[];
    if (payload && typeof payload === 'object') {
      const o = payload as { data?: unknown };
      if (Array.isArray(o.data)) return o.data as AppNotification[];
      if (o.data && typeof o.data === 'object') {
        const inner = o.data as Partial<NotificationsResponse> & {
          notifications?: AppNotification[];
        };
        if (Array.isArray(inner.notifications)) return inner.notifications;
      }
    }
    return [];
  } catch {
    return [];
  }
}

async function markRead(id: string): Promise<void> {
  await apiClient.put(`/api/v1/notifications/${id}/read`);
}

async function markAllRead(): Promise<void> {
  await apiClient.put('/api/v1/notifications/read-all');
}

// ─── Hook: unread count badge ──────────────────────────────────────────────
export function useUnreadNotificationsCount(): number {
  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: fetchNotifications,
    refetchInterval: 30_000,
  });
  return useMemo(
    () => (data ?? []).filter((n) => !n.isRead).length,
    [data]
  );
}

// ─── Row ────────────────────────────────────────────────────────────────────
function NotificationRow({
  item,
  onPress,
}: {
  item: AppNotification;
  onPress: (item: AppNotification) => void;
}) {
  const { icon, bg, fg } = pickIcon(item);
  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={() => onPress(item)}
      style={[styles.row, !item.isRead && styles.rowUnread]}
    >
      <View style={[styles.iconCircle, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={20} color={fg} />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {item.title}
        </Text>
        {item.body ? (
          <Text style={styles.rowText} numberOfLines={2}>
            {item.body}
          </Text>
        ) : null}
        <Text style={styles.rowTime}>{relativeTime(item.createdAt)}</Text>
      </View>
      {!item.isRead ? <View style={styles.unreadDot} /> : null}
    </TouchableOpacity>
  );
}

function RowSkeleton() {
  return (
    <View style={styles.row}>
      <Skeleton width={40} height={40} radius={20} />
      <View style={{ flex: 1, gap: 6 }}>
        <Skeleton width="70%" height={14} />
        <Skeleton width="90%" height={12} />
        <Skeleton width="30%" height={10} />
      </View>
    </View>
  );
}

// ─── Screen ────────────────────────────────────────────────────────────────
export default function NotificationsScreen() {
  const queryClient = useQueryClient();
  // Native iOS Stack header is transparent + blurred — without this offset,
  // content scrolls under it and the first notification gets clipped.
  const headerHeight = useHeaderHeight();

  const query = useQuery({
    queryKey: ['notifications'],
    queryFn: fetchNotifications,
    refetchInterval: 30_000,
  });

  const notifications = query.data ?? [];
  const unread = notifications.filter((n) => !n.isRead).length;

  const markReadMutation = useMutation({
    mutationFn: markRead,
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ['notifications'] });
      const prev = queryClient.getQueryData<AppNotification[]>(['notifications']);
      queryClient.setQueryData<AppNotification[]>(['notifications'], (old) =>
        (old ?? []).map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev)
        queryClient.setQueryData(['notifications'], ctx.prev);
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllMutation = useMutation({
    mutationFn: markAllRead,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['notifications'] });
      const prev = queryClient.getQueryData<AppNotification[]>(['notifications']);
      queryClient.setQueryData<AppNotification[]>(['notifications'], (old) =>
        (old ?? []).map((n) => ({ ...n, isRead: true }))
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev)
        queryClient.setQueryData(['notifications'], ctx.prev);
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const handleRowPress = useCallback(
    (item: AppNotification) => {
      if (!item.isRead) markReadMutation.mutate(item.id);
      const orderId =
        typeof item.data?.orderId === 'string'
          ? (item.data.orderId as string)
          : undefined;
      if (orderId) {
        router.push(`/order/${orderId}`);
      }
    },
    [markReadMutation]
  );

  const headerRight = useCallback(() => {
    if (unread === 0) return null;
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => markAllMutation.mutate()}
        hitSlop={8}
      >
        <Text style={styles.headerAction}>Mark all read</Text>
      </TouchableOpacity>
    );
  }, [unread, markAllMutation]);

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <Stack.Screen
        options={{
          title: 'Notifications',
          headerRight,
        }}
      />
      {query.isLoading ? (
        <View style={[styles.list, { paddingTop: headerHeight + spacing.lg }]}>
          <RowSkeleton />
          <RowSkeleton />
          <RowSkeleton />
          <RowSkeleton />
        </View>
      ) : notifications.length === 0 ? (
        <View style={{ flex: 1, paddingTop: headerHeight }}>
          <EmptyState
            emoji="🔔"
            title="No notifications yet"
            subtitle="We'll let you know when something happens with your orders."
          />
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(n) => n.id}
          contentContainerStyle={[styles.list, { paddingTop: headerHeight + spacing.lg }]}
          contentInsetAdjustmentBehavior="never"
          ItemSeparatorComponent={() => <View style={styles.divider} />}
          renderItem={({ item }) => (
            <NotificationRow item={item} onPress={handleRowPress} />
          )}
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={() => query.refetch()}
              progressViewOffset={headerHeight}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  list: {
    // paddingTop is set dynamically (header height + spacing) by the screen
    paddingBottom: spacing.xxxl,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: spacing.lg + 40 + spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.card,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  rowUnread: {
    backgroundColor: colors.primaryLight + '33',
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  rowText: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  rowTime: {
    marginTop: 2,
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '600',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginTop: 6,
  },
  headerAction: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.primary,
    paddingHorizontal: spacing.sm,
  },
});
