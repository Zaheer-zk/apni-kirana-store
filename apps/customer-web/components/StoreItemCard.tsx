'use client';

import Link from 'next/link';
import { Clock, MapPin, Star } from 'lucide-react';
import { Badge } from '@aks/ui/components/badge';
import { Button } from '@aks/ui/components/button';
import { toast } from '@aks/ui/components/sonner';
import { useCart } from '@/lib/cart';
import { FavoriteButton } from './FavoriteButton';
import { distance as fmtDistance, etaWindow, rupees } from '@/lib/format';

/**
 * The cross-store search result returned by `GET /api/v1/items/search`.
 * Each row is a StoreItem at one nearby store; the same catalogItem appears
 * once per store carrying it.
 */
export interface StoreSearchHit {
  storeItemId: string;
  catalogItemId: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  unit: string;
  category: string;
  /** Store owner's payout per unit. */
  price: number;
  /** Admin's commission per unit (added on top of `price`). */
  adminMargin?: number;
  /** Customer-facing price = price + adminMargin. Computed server-side. */
  customerPrice?: number;
  stockQty: number;
  rating: number;
  store: {
    id: string;
    name: string;
    distanceKm: number | null;
    isOpen: boolean;
  };
  /** Number of in-zone stores carrying this catalog item (server-deduped). */
  offerCount?: number;
  /** Min customer-facing price across all stores (rupees). */
  minCustomerPrice?: number;
  /** Max customer-facing price across all stores (rupees). */
  maxCustomerPrice?: number;
}

interface StoreItemCardProps {
  hit: StoreSearchHit;
  /** Compact mode used inside horizontal carousels on the home page. */
  compact?: boolean;
}

export function StoreItemCard({ hit, compact = false }: StoreItemCardProps) {
  // Catalog-keyed cart: no single-store conflict path. The engine picks
  // the fulfilling store at order time (cross-zone re-match in POST /orders).
  const add = useCart((s) => s.add);

  // Customer-facing price = store payout + admin margin. Backend serves it
  // as `customerPrice`; fall back to plain `price` for legacy responses.
  const displayPrice =
    (hit as { customerPrice?: number; price: number }).customerPrice ?? hit.price;

  function handleAdd(): void {
    if (hit.stockQty <= 0) {
      toast.error('This item is out of stock');
      return;
    }
    const result = add({
      catalogItemId: hit.catalogItemId,
      // storeItemId is a snapshot hint — engine ignores at order time.
      storeItemId: hit.storeItemId,
      name: hit.name,
      price: displayPrice,
      unit: hit.unit,
      imageUrl: hit.imageUrl ?? null,
      maxStock: hit.stockQty,
    });
    toast.success(
      result === 'bumped'
        ? `Added another ${hit.name}`
        : `${hit.name} added to cart`,
    );
  }

  const distLabel = fmtDistance(hit.store.distanceKm);
  const eta = etaWindow(hit.store.distanceKm);
  const outOfStock = hit.stockQty <= 0;

  if (compact) {
    return (
      <div className="relative w-44 flex-shrink-0 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
        <FavoriteButton
          catalogItemId={hit.catalogItemId}
          name={hit.name}
          className="absolute right-2 top-2 z-10 h-8 w-8 bg-white/80 backdrop-blur"
        />
        <Link href={`/item/${hit.storeItemId}`} className="block">
          <Thumbnail imageUrl={hit.imageUrl} alt={hit.name} className="h-28 w-full rounded-lg" />
          <p className="mt-2 line-clamp-2 text-sm font-semibold text-gray-900">{hit.name}</p>
          <p className="mt-0.5 text-xs text-gray-500">{hit.unit}</p>
        </Link>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-base font-bold text-gray-900">{rupees(displayPrice)}</span>
          <Button
            size="sm"
            variant={outOfStock ? 'outline' : 'default'}
            onClick={handleAdd}
            disabled={outOfStock}
            className="h-8 px-3"
          >
            {outOfStock ? 'Out' : 'Add'}
          </Button>
        </div>
        <p className="mt-1 truncate text-[11px] font-medium text-gray-500">
          {hit.offerCount && hit.offerCount > 1
            ? `${hit.offerCount} stores nearby`
            : hit.store.name}
        </p>
      </div>
    );
  }

  return (
    <article className="flex gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm transition hover:border-primary-200 hover:shadow-md sm:gap-4 sm:p-4">
      <Link href={`/item/${hit.storeItemId}`} aria-label={hit.name}>
        <Thumbnail
          imageUrl={hit.imageUrl}
          alt={hit.name}
          className="h-20 w-20 flex-shrink-0 rounded-lg sm:h-24 sm:w-24"
        />
      </Link>

      <div className="flex min-w-0 flex-1 flex-col">
        <Link href={`/item/${hit.storeItemId}`} className="group">
          <p className="line-clamp-2 text-sm font-semibold text-gray-900 group-hover:text-primary sm:text-base">
            {hit.name}
          </p>
        </Link>
        <p className="mt-0.5 text-xs text-gray-500">{hit.unit}</p>

        <div className="mt-1 flex items-center gap-2 text-xs text-gray-600">
          <span className="flex items-center gap-1 font-medium text-gray-700">
            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
            {hit.rating.toFixed(1)}
          </span>
          <span aria-hidden>·</span>
          <span className="truncate">{hit.store.name}</span>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] font-medium text-gray-500">
          {distLabel ? (
            <span className="inline-flex items-center gap-0.5">
              <MapPin className="h-3 w-3" />
              {distLabel}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-0.5">
            <Clock className="h-3 w-3" />
            {eta}
          </span>
          {!hit.store.isOpen ? (
            <Badge variant="warning" className="text-[10px]">Closed</Badge>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col items-end justify-between gap-2">
        <FavoriteButton
          catalogItemId={hit.catalogItemId}
          name={hit.name}
          className="-mr-1 -mt-1 h-8 w-8"
        />
        <div className="flex flex-col items-end">
          <span className="text-base font-bold text-gray-900 sm:text-lg">
            {rupees(displayPrice)}
          </span>
          {hit.offerCount &&
          hit.offerCount > 1 &&
          hit.minCustomerPrice != null &&
          hit.minCustomerPrice < displayPrice ? (
            <span className="text-[10px] text-gray-500">
              from {rupees(hit.minCustomerPrice)}
            </span>
          ) : null}
        </div>
        <Button
          variant={outOfStock ? 'outline' : 'default'}
          size="sm"
          onClick={handleAdd}
          disabled={outOfStock}
        >
          {outOfStock ? 'Out of stock' : 'Add'}
        </Button>
      </div>
    </article>
  );
}

function Thumbnail({
  imageUrl,
  alt,
  className,
}: {
  imageUrl?: string | null;
  alt: string;
  className?: string;
}) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- next/image
      // requires `remotePatterns` upfront and product photos can come from
      // any store-supplied CDN. Using a plain <img> keeps the experience
      // graceful for unknown hosts.
      <img
        src={imageUrl}
        alt={alt}
        loading="lazy"
        className={`object-cover ${className ?? ''}`}
      />
    );
  }
  return (
    <div
      role="img"
      aria-label={alt}
      className={`flex items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100 text-primary-700 ${className ?? ''}`}
    >
      <span className="text-2xl font-bold">{alt.slice(0, 1).toUpperCase()}</span>
    </div>
  );
}
