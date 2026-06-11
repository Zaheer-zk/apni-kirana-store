import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { FavoriteEntry } from '@aks/shared';
import { apiClient } from './api';
import { useAuthStore } from '@/store/auth.store';

/**
 * Customer favorites / wishlist client (mobile).
 *
 * Mirrors apps/customer-web/lib/favorites.ts. Favorites are keyed on
 * `catalogItemId` (the canonical product) to match the catalog-keyed cart, so
 * a heart stays lit across stores and survives a store going out of stock.
 *   - `useFavoriteIds()`  → shared Set of favorited catalogItemIds (one fetch
 *     per screen; every heart reads it).
 *   - `useToggleFavorite()` → optimistic add/remove patching the id cache.
 */

const IDS_KEY = ['favorites', 'ids'] as const;
export const FAVORITES_LIST_KEY = ['favorites', 'list'] as const;

function payloadData<T>(res: { data: unknown }): T {
  const body = res.data as { data?: T };
  return body?.data as T;
}

export async function fetchFavoriteIds(): Promise<string[]> {
  const res = await apiClient.get('/api/v1/favorites/ids');
  return payloadData<{ ids: string[] }>(res).ids ?? [];
}

export async function fetchFavorites(coords?: {
  lat: number;
  lng: number;
}): Promise<FavoriteEntry[]> {
  const res = await apiClient.get('/api/v1/favorites', {
    params: coords ? { lat: coords.lat, lng: coords.lng } : undefined,
  });
  return payloadData<{ items: FavoriteEntry[] }>(res).items ?? [];
}

export function useFavoriteIds(): { ids: Set<string>; isLoggedIn: boolean } {
  const isLoggedIn = !!useAuthStore((s) => s.accessToken);
  const { data } = useQuery({
    queryKey: IDS_KEY,
    queryFn: fetchFavoriteIds,
    enabled: isLoggedIn,
    staleTime: 60_000,
  });
  return { ids: new Set(data ?? []), isLoggedIn };
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ catalogItemId, next }: { catalogItemId: string; next: boolean }) => {
      if (next) await apiClient.post('/api/v1/favorites', { catalogItemId });
      else await apiClient.delete(`/api/v1/favorites/${catalogItemId}`);
      return { catalogItemId, next };
    },
    onMutate: async ({ catalogItemId, next }) => {
      await qc.cancelQueries({ queryKey: IDS_KEY });
      const prev = qc.getQueryData<string[]>(IDS_KEY) ?? [];
      const updated = next
        ? Array.from(new Set([...prev, catalogItemId]))
        : prev.filter((id) => id !== catalogItemId);
      qc.setQueryData<string[]>(IDS_KEY, updated);
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(IDS_KEY, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: IDS_KEY });
      qc.invalidateQueries({ queryKey: FAVORITES_LIST_KEY });
    },
  });
}
