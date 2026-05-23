'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Search, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@aks/ui/components/button';
import { Input } from '@aks/ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@aks/ui/components/select';
import { Skeleton } from '@aks/ui/components/skeleton';
import { AppHeader } from '@/components/AppHeader';
import { StoreItemCard, type StoreSearchHit } from '@/components/StoreItemCard';
import { EmptyPanel, ErrorPanel, PageLoader } from '@/components/StatePanels';
import { api, unwrap } from '@/lib/api';
import { useLocation } from '@/lib/use-location';

type Sort = 'recommended' | 'cheapest' | 'nearest';

const SORT_LABEL: Record<Sort, string> = {
  recommended: 'Recommended',
  cheapest: 'Lowest price',
  nearest: 'Nearest store',
};

function SearchPageInner() {
  const router = useRouter();
  const params = useSearchParams();

  const initialQ = params.get('q') ?? '';
  const initialSort = (params.get('sort') as Sort) ?? 'recommended';

  const [query, setQuery] = useState(initialQ);
  const [debounced, setDebounced] = useState(initialQ);
  const [sort, setSort] = useState<Sort>(initialSort);

  // Debounce typed input — avoids a backend hit on every keystroke and keeps
  // the URL in sync once the user pauses for ~300 ms.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  // Reflect debounced query + sort in the URL so links and refreshes work.
  useEffect(() => {
    const search = new URLSearchParams();
    if (debounced) search.set('q', debounced);
    if (sort !== 'recommended') search.set('sort', sort);
    const qs = search.toString();
    router.replace(qs ? `/search?${qs}` : '/search', { scroll: false });
    // We intentionally exclude router from deps — Next's router identity is
    // stable across renders but TS still warns; the lint rule allows this
    // shape.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, sort]);

  const { coords, status } = useLocation();

  const searchQuery = useQuery({
    queryKey: ['search', debounced, sort, coords.lat, coords.lng],
    queryFn: async () => {
      const res = await api.get('/api/v1/items/search', {
        params: {
          q: debounced || undefined,
          lat: coords.lat,
          lng: coords.lng,
          sort,
          limit: 50,
        },
      });
      return unwrap<{ items: StoreSearchHit[]; total: number; radiusKm: number }>(res.data);
    },
    enabled: status !== 'requesting',
  });

  const items = searchQuery.data?.items ?? [];

  return (
    <>
      <AppHeader showSearch={false} />

      <div className="border-b border-gray-200 bg-white">
        <div className="page-shell flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Back"
            className="hidden h-10 w-10 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 sm:inline-flex"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search rice, soap, paracetamol…"
              aria-label="Search items"
              className="h-11 pl-9 pr-9"
              autoFocus
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-gray-500" aria-hidden />
            <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
              <SelectTrigger className="h-10 w-44">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                {(['recommended', 'cheapest', 'nearest'] as Sort[]).map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {SORT_LABEL[opt]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <main className="page-shell py-6">
        <ResultsHeader
          query={debounced}
          total={searchQuery.data?.total ?? items.length}
          loading={searchQuery.isLoading}
        />

        {searchQuery.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={`sk-${i}`} className="h-28 w-full rounded-xl" />
            ))}
          </div>
        ) : searchQuery.isError ? (
          <ErrorPanel
            message="Couldn't load search results. Check your connection and try again."
            onRetry={() => searchQuery.refetch()}
          />
        ) : items.length === 0 ? (
          <EmptyPanel
            icon={<Search className="h-6 w-6" />}
            title="No matching items"
            subtitle={
              debounced
                ? `Nothing matches "${debounced}" in stores near you. Try a different keyword.`
                : 'No items available right now. Try searching for something specific.'
            }
            action={
              debounced ? (
                <Button variant="outline" size="sm" onClick={() => setQuery('')}>
                  Clear search
                </Button>
              ) : null
            }
          />
        ) : (
          <div className="space-y-3">
            {items.map((hit) => (
              <StoreItemCard key={hit.storeItemId} hit={hit} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}

function ResultsHeader({
  query,
  total,
  loading,
}: {
  query: string;
  total: number;
  loading: boolean;
}) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-3">
      <h1 className="text-lg font-semibold text-gray-800 sm:text-xl">
        {loading ? (
          'Searching…'
        ) : query ? (
          <>
            {total} result{total === 1 ? '' : 's'}
            <span className="ml-1 text-gray-500"> for “{query}”</span>
          </>
        ) : (
          'Top items near you'
        )}
      </h1>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <SearchPageInner />
    </Suspense>
  );
}
