'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { FavoriteEntry } from '@aks/shared';
import { api, unwrap } from './api';
import { getStoredUser } from './auth';

/**
 * Customer favorites / wishlist client.
 *
 * Favorites are keyed on `catalogItemId` (the canonical product), matching the
 * catalog-keyed cart — so a heart stays lit across stores and survives a store
 * going out of stock. Two layers:
 *
 *   - `useFavoriteIds()` — one cheap call returning the Set of favorited
 *     catalogItemIds, shared by every heart toggle on the page so cards don't
 *     each fetch their own state.
 *   - `useToggleFavorite()` — optimistic add/remove that patches the id-set
 *     cache immediately and invalidates the full list.
 */

const IDS_KEY = ['favorites', 'ids'] as const;
export const FAVORITES_LIST_KEY = ['favorites', 'list'] as const;

export async function fetchFavoriteIds(): Promise<string[]> {
  const res = await api.get('/api/v1/favorites/ids');
  return unwrap<{ ids: string[] }>(res.data).ids ?? [];
}

export async function fetchFavorites(
  coords?: { lat: number; lng: number },
): Promise<FavoriteEntry[]> {
  const res = await api.get('/api/v1/favorites', {
    params: coords ? { lat: coords.lat, lng: coords.lng } : undefined,
  });
  return unwrap<{ items: FavoriteEntry[] }>(res.data).items ?? [];
}

export async function addFavorite(catalogItemId: string): Promise<void> {
  await api.post('/api/v1/favorites', { catalogItemId });
}

export async function removeFavorite(catalogItemId: string): Promise<void> {
  await api.delete(`/api/v1/favorites/${catalogItemId}`);
}

/**
 * The Set of catalogItemIds the signed-in customer has favorited. Returns an
 * empty Set (and never fires the request) when logged out, so item cards on
 * public pages render a hollow heart without a 401.
 */
export function useFavoriteIds(): { ids: Set<string>; isLoggedIn: boolean } {
  const isLoggedIn = typeof window !== 'undefined' && !!getStoredUser();
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
    mutationFn: async ({
      catalogItemId,
      next,
    }: {
      catalogItemId: string;
      next: boolean;
    }) => {
      if (next) await addFavorite(catalogItemId);
      else await removeFavorite(catalogItemId);
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
