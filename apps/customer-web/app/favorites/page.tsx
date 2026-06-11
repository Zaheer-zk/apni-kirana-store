'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Clock, Heart, MapPin } from 'lucide-react';
import { Button } from '@aks/ui/components/button';
import { Skeleton } from '@aks/ui/components/skeleton';
import { toast } from '@aks/ui/components/sonner';
import { AppHeader } from '@/components/AppHeader';
import { FavoriteButton } from '@/components/FavoriteButton';
import { EmptyPanel, ErrorPanel } from '@/components/StatePanels';
import { useCart } from '@/lib/cart';
import { useUser } from '@/lib/use-user';
import { useLocation } from '@/lib/use-location';
import { fetchFavorites, FAVORITES_LIST_KEY } from '@/lib/favorites';
import { distance as fmtDistance, etaWindow, rupees } from '@/lib/format';

/**
 * Customer favorites / wishlist. Each saved product re-resolves the cheapest
 * in-stock nearby store at read time (server-side), so the list is always
 * actionable: add-to-cart goes through the same catalog-keyed path as search.
 */
export default function FavoritesPage() {
  const { mounted } = useUser({ redirectTo: '/favorites' });
  const { coords } = useLocation();
  const add = useCart((s) => s.add);

  const query = useQuery({
    queryKey: [...FAVORITES_LIST_KEY, coords.lat, coords.lng],
    queryFn: () => fetchFavorites(coords),
    enabled: mounted,
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      <main className="page-shell py-6">
        <div className="mb-5 flex items-center gap-2">
          <Heart className="h-6 w-6 fill-rose-500 text-rose-500" />
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Your favorites</h1>
        </div>

        {query.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        ) : query.isError ? (
          <ErrorPanel
            message="Couldn't load favorites. Please try again in a moment."
            onRetry={() => query.refetch()}
          />
        ) : !query.data || query.data.length === 0 ? (
          <EmptyPanel
            icon={<Heart className="h-8 w-8 text-rose-400" />}
            title="No favorites yet"
            subtitle="Tap the heart on any product to save it here for quick reordering."
            action={
              <Button asChild>
                <Link href="/search">Browse products</Link>
              </Button>
            }
          />
        ) : (
          <ul className="space-y-3">
            {query.data.map((fav) => {
              const offer = fav.bestOffer;
              const outOfStock = !offer || offer.stockQty <= 0;
              const price = offer?.customerPrice;

              function handleAdd() {
                if (!offer) return;
                add({
                  catalogItemId: fav.catalogItemId,
                  storeItemId: offer.storeItemId,
                  name: fav.name,
                  price: offer.customerPrice,
                  unit: fav.unit,
                  imageUrl: fav.imageUrl ?? null,
                  maxStock: offer.stockQty,
                });
                toast.success(`${fav.name} added to cart`);
              }

              return (
                <li
                  key={fav.catalogItemId}
                  className="flex gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm sm:gap-4 sm:p-4"
                >
                  <Thumbnail imageUrl={fav.imageUrl} alt={fav.name} />

                  <div className="flex min-w-0 flex-1 flex-col">
                    <p className="line-clamp-2 text-sm font-semibold text-gray-900 sm:text-base">
                      {fav.name}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">{fav.unit}</p>

                    {offer ? (
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] font-medium text-gray-500">
                        <span className="truncate">{offer.store.name}</span>
                        {fmtDistance(offer.store.distanceKm) ? (
                          <span className="inline-flex items-center gap-0.5">
                            <MapPin className="h-3 w-3" />
                            {fmtDistance(offer.store.distanceKm)}
                          </span>
                        ) : null}
                        <span className="inline-flex items-center gap-0.5">
                          <Clock className="h-3 w-3" />
                          {etaWindow(offer.store.distanceKm)}
                        </span>
                        {fav.offerCount > 1 ? (
                          <span>{fav.offerCount} stores</span>
                        ) : null}
                      </div>
                    ) : (
                      <p className="mt-1 text-[11px] font-medium text-amber-600">
                        Not available near you right now
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col items-end justify-between gap-2">
                    <FavoriteButton
                      catalogItemId={fav.catalogItemId}
                      name={fav.name}
                      className="-mr-1 -mt-1 h-8 w-8"
                    />
                    <div className="flex flex-col items-end gap-1">
                      {price != null ? (
                        <span className="text-base font-bold text-gray-900">{rupees(price)}</span>
                      ) : null}
                      <Button
                        size="sm"
                        variant={outOfStock ? 'outline' : 'default'}
                        onClick={handleAdd}
                        disabled={outOfStock}
                      >
                        {outOfStock ? 'Unavailable' : 'Add'}
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}

function Thumbnail({ imageUrl, alt }: { imageUrl?: string | null; alt: string }) {
  const cls = 'h-20 w-20 flex-shrink-0 rounded-lg sm:h-24 sm:w-24';
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={imageUrl} alt={alt} loading="lazy" className={`object-cover ${cls}`} />
    );
  }
  return (
    <div
      role="img"
      aria-label={alt}
      className={`flex items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100 text-primary-700 ${cls}`}
    >
      <span className="text-2xl font-bold">{alt.slice(0, 1).toUpperCase()}</span>
    </div>
  );
}
