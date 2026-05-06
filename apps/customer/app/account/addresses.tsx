import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Badge } from '@/components/Badge';
import { EmptyState } from '@/components/EmptyState';
import { Header } from '@/components/Header';
import { apiClient } from '@/lib/api';
import { colors, fontSize, radius, shadow, spacing } from '@/constants/theme';
import type { Address } from '@aks/shared';

function unwrapList<T>(payload: unknown, listKey?: string): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === 'object') {
    const o = payload as Record<string, unknown>;
    if (Array.isArray(o.data)) return o.data as T[];
    if (o.data && typeof o.data === 'object') {
      const inner = o.data as Record<string, unknown>;
      if (listKey && Array.isArray(inner[listKey])) return inner[listKey] as T[];
    }
    if (listKey && Array.isArray(o[listKey])) return o[listKey] as T[];
  }
  return [];
}

async function fetchAddresses(): Promise<Address[]> {
  const res = await apiClient.get('/api/v1/addresses');
  return unwrapList<Address>(res.data);
}

function variantForLabel(label: string): 'primary' | 'info' | 'purple' | 'default' {
  const norm = label.toLowerCase();
  if (norm.includes('home')) return 'primary';
  if (norm.includes('work') || norm.includes('office')) return 'info';
  if (norm.includes('other')) return 'purple';
  return 'default';
}

interface AddressCardProps {
  address: Address;
  onSetDefault: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (address: Address) => void;
  busy: boolean;
}

function AddressCard({ address, onSetDefault, onEdit, onDelete, busy }: AddressCardProps) {
  return (
    <View style={[styles.card, address.isDefault ? styles.cardDefault : null]}>
      <View style={styles.cardHead}>
        <Badge variant={variantForLabel(address.label)} text={address.label} />
        {address.isDefault ? <Badge variant="success" text="Default" /> : null}
      </View>

      <Text style={styles.street} numberOfLines={2}>
        {address.street}
      </Text>
      <Text style={styles.meta}>
        {[address.city, address.state, address.pincode].filter(Boolean).join(', ')}
      </Text>

      <View style={styles.actions}>
        {!address.isDefault ? (
          <TouchableOpacity
            style={styles.actionBtn}
            activeOpacity={0.7}
            onPress={() => onSetDefault(address.id)}
            disabled={busy}
          >
            <Ionicons name="star-outline" size={16} color={colors.primary} />
            <Text style={[styles.actionText, { color: colors.primary }]}>Set default</Text>
          </TouchableOpacity>
        ) : (
          <View style={[styles.actionBtn, { opacity: 0.6 }]}>
            <Ionicons name="checkmark-circle" size={16} color={colors.success} />
            <Text style={[styles.actionText, { color: colors.success }]}>Default</Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.actionBtn}
          activeOpacity={0.7}
          onPress={() => onEdit(address.id)}
          disabled={busy}
        >
          <Ionicons name="pencil-outline" size={16} color={colors.textPrimary} />
          <Text style={styles.actionText}>Edit</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBtn}
          activeOpacity={0.7}
          onPress={() => onDelete(address)}
          disabled={busy}
        >
          <Ionicons name="trash-outline" size={16} color={colors.error} />
          <Text style={[styles.actionText, { color: colors.error }]}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function AddressesScreen() {
  const qc = useQueryClient();

  const addressesQuery = useQuery({
    queryKey: ['addresses'],
    queryFn: fetchAddresses,
  });

  const setDefaultMutation = useMutation({
    mutationFn: (id: string) => apiClient.put(`/api/v1/addresses/${id}/default`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['addresses'] });
      qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: () => Alert.alert('Failed', 'Could not update default address.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/v1/addresses/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['addresses'] });
      qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: () => Alert.alert('Failed', 'Could not delete address.'),
  });

  const busy = setDefaultMutation.isPending || deleteMutation.isPending;
  const addresses = addressesQuery.data ?? [];

  function handleEdit(id: string) {
    router.push({ pathname: '/account/edit-address', params: { id } });
  }

  function handleDelete(address: Address) {
    Alert.alert(
      'Delete address',
      `Remove "${address.label}" from your saved addresses?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteMutation.mutate(address.id),
        },
      ],
    );
  }

  function handleAdd() {
    router.push('/onboarding/map-picker');
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Header title="My Addresses" />

      {addressesQuery.isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : addresses.length === 0 ? (
        <View style={{ flex: 1 }}>
          <EmptyState
            icon="location-outline"
            title="No saved addresses"
            subtitle="Add a delivery address to start ordering from nearby stores."
            actionLabel="Add your first address"
            onAction={handleAdd}
          />
        </View>
      ) : (
        <FlatList
          data={addresses}
          keyExtractor={(a) => a.id}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          renderItem={({ item }) => (
            <AddressCard
              address={item}
              onSetDefault={(id) => setDefaultMutation.mutate(id)}
              onEdit={handleEdit}
              onDelete={handleDelete}
              busy={busy}
            />
          )}
        />
      )}

      <View style={styles.fabWrap}>
        <TouchableOpacity
          style={styles.fab}
          activeOpacity={0.85}
          onPress={handleAdd}
        >
          <Ionicons name="add" size={22} color={colors.white} />
          <Text style={styles.fabText}>Add new address</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    padding: spacing.lg,
    paddingBottom: 120,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadow.small,
  },
  cardDefault: {
    borderColor: colors.primary,
  },
  cardHead: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
    marginBottom: spacing.xs,
  },
  street: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 22,
  },
  meta: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
  },
  actionText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  fabWrap: {
    position: 'absolute',
    bottom: spacing.xl,
    left: spacing.lg,
    right: spacing.lg,
  },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: radius.full,
    ...shadow.large,
  },
  fabText: {
    color: colors.white,
    fontSize: fontSize.md,
    fontWeight: '800',
  },
});
