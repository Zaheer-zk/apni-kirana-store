'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { Bike, MapPin, Search, ShieldCheck, Clock3 } from 'lucide-react';
import { Button } from '@aks/ui/components/button';
import { Skeleton } from '@aks/ui/components/skeleton';
import { Badge } from '@aks/ui/components/badge';
import { AppHeader } from '@/components/AppHeader';
import { StoreItemCard, type StoreSearchHit } from '@/components/StoreItemCard';
import { EmptyPanel, ErrorPanel } from '@/components/StatePanels';
import { api, unwrap } from '@/lib/api';
import { useLocation } from '@/lib/use-location';

const TRENDING = ['Rice', 'Milk', 'Bread', 'Maggi', 'Sugar', 'Tea', 'Soap', 'Paracetamol'];

export default function HomePage() {
  return (
    <>
      <AppHeader showSearch />
      <main className="page-shell py-6 sm:py-10">
        <Hero />
        <CoverageBanner />
        <SearchEntry />
        <FeaturedSection />
        <PromiseGrid />
      </main>
      <Footer />
    </>
  );
}

// Shows a friendly "we don't serve your area yet" banner when the customer's
// location falls outside every active platform zone. The matching engine
// would silently fail to find a store/driver in that case; surfacing it
// here lets the customer fix their address (or wait for us to expand).
function CoverageBanner() {
  const { coords, status } = useLocation();
  const coverage = useQuery({
    queryKey: ['coverage', coords.lat, coords.lng],
    queryFn: async () => {
      const res = await api.get('/api/v1/zones/coverage', {
        params: { lat: coords.lat, lng: coords.lng },
      });
      return unwrap<{
        inZone: boolean;
        zone: { name: string; city: string } | null;
        nearestZone?: { name: string; city: string; centerLat: number; centerLng: number } | null;
        distanceKm: number | null;
      }>(res.data);
    },
    // Don't hammer the endpoint — coverage is stable per location.
    staleTime: 5 * 60_000,
    enabled: status !== 'requesting',
  });

  if (coverage.isLoading || coverage.isError) return null;
  const data = coverage.data;
  if (!data) return null;

  // In-zone OR no zones configured yet — show a quiet confirmation chip
  // so the user knows we picked up their location. Optional polish.
  if (data.inZone && data.zone) {
    return (
      <div className="mb-6 flex flex-wrap items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-medium text-emerald-800">
        <MapPin className="h-3.5 w-3.5" />
        Delivering to <span className="font-semibold">{data.zone.name}</span>, {data.zone.city}
      </div>
    );
  }

  // Out of every zone — loud amber banner with a CTA to update location +
  // a hint about the nearest area we serve.
  return (
    <div className="mb-6 overflow-hidden rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber-100">
          <MapPin className="h-5 w-5 text-amber-700" />
        </div>
        <div className="flex-1">
          <p className="text-base font-bold text-amber-900">
            We&apos;re not here yet
          </p>
          <p className="mt-1 text-sm text-amber-800">
            Your current location is outside our delivery area.
            {data.nearestZone ? (
              <>
                {' '}
                The closest area we serve is{' '}
                <span className="font-semibold">
                  {data.nearestZone.name}, {data.nearestZone.city}
                </span>
                {data.distanceKm != null ? (
                  <> (~{data.distanceKm.toFixed(1)} km away)</>
                ) : null}
                .
              </>
            ) : null}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="default"
              onClick={() => {
                if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
                  navigator.geolocation.getCurrentPosition(
                    () => globalThis.location.reload(),
                    () => undefined,
                    { timeout: 8000 },
                  );
                }
              }}
              className="bg-amber-600 hover:bg-amber-700"
            >
              <MapPin className="h-3.5 w-3.5" />
              Use my current location
            </Button>
            <Link
              href="/addresses"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-amber-300 bg-white px-3 text-sm font-semibold text-amber-900 hover:bg-amber-100"
            >
              Manage saved addresses
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function Hero() {
  const t = useTranslations('home');
  return (
    <section className="relative mb-8 overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-primary-700 px-6 py-10 text-white shadow-md sm:px-10 sm:py-14">
      <div className="relative z-10 max-w-xl">
        <Badge variant="warning" className="mb-3">
          {t('heroBadge')}
        </Badge>
        <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
          {t('heroTitle')}
        </h1>
        <p className="mt-3 text-sm text-primary-100 sm:text-base">
          {t('heroSubtitle')}
        </p>
      </div>

      <Bike
        className="pointer-events-none absolute -bottom-6 -right-4 hidden h-44 w-44 text-primary-400/40 sm:block"
        aria-hidden
      />
    </section>
  );
}

function SearchEntry() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const t = useTranslations('home');
  const tCommon = useTranslations('common');

  function go(q?: string) {
    const v = (q ?? query).trim();
    if (!v) return;
    router.push(`/search?q=${encodeURIComponent(v)}`);
  }

  return (
    <section className="mb-10">
      <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
        <Search className="ml-2 h-5 w-5 text-primary" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') go();
          }}
          placeholder={t('searchPlaceholder')}
          aria-label={tCommon('search')}
          className="flex-1 bg-transparent text-base text-gray-900 placeholder:text-gray-400 focus:outline-none"
        />
        <Button onClick={() => go()} disabled={!query.trim()}>
          {tCommon('search')}
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-gray-500">{t('trending')}</span>
        {TRENDING.map((term) => (
          <button
            key={term}
            type="button"
            onClick={() => go(term)}
            className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-600 transition hover:border-primary-200 hover:text-primary"
          >
            {term}
          </button>
        ))}
      </div>
    </section>
  );
}

function FeaturedSection() {
  const { coords, status } = useLocation();
  const t = useTranslations('home');
  const tCommon = useTranslations('common');

  // "Featured" is just the search endpoint with an empty query — the
  // ranking engine returns the best-scoring nearby items.
  const featuredQuery = useQuery({
    queryKey: ['featured', coords.lat, coords.lng],
    queryFn: async () => {
      const res = await api.get('/api/v1/items/search', {
        params: { lat: coords.lat, lng: coords.lng, sort: 'recommended', limit: 12 },
      });
      return unwrap<{ items: StoreSearchHit[] }>(res.data);
    },
    enabled: status !== 'requesting',
  });

  const items = featuredQuery.data?.items ?? [];

  return (
    <section className="mb-10">
      <header className="mb-4 flex items-end justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">{t('popularNearYou')}</h2>
          <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
            <MapPin className="h-3 w-3" />
            {status === 'granted' ? t('usingCurrentLocation') : t('usingDefaultLocation')}
          </p>
        </div>
        <Link href="/search" className="text-sm font-semibold text-primary hover:text-primary-700">
          {tCommon('viewAll')}
        </Link>
      </header>

      {featuredQuery.isLoading ? (
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="w-44 flex-shrink-0 space-y-2">
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : featuredQuery.isError ? (
        <ErrorPanel
          message={t('loadError')}
          onRetry={() => featuredQuery.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyPanel
          icon={<Search className="h-6 w-6" />}
          title={t('nothingNearbyTitle')}
          subtitle={t('nothingNearbySubtitle')}
        />
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2 sm:gap-4">
          {items.map((hit) => (
            <StoreItemCard key={hit.storeItemId} hit={hit} compact />
          ))}
        </div>
      )}
    </section>
  );
}

function PromiseGrid() {
  const t = useTranslations('home');
  const promises = [
    {
      icon: <Bike className="h-6 w-6 text-primary" />,
      title: t('promiseFastTitle'),
      body: t('promiseFastBody'),
    },
    {
      icon: <ShieldCheck className="h-6 w-6 text-primary" />,
      title: t('promiseSameTitle'),
      body: t('promiseSameBody'),
    },
    {
      icon: <Clock3 className="h-6 w-6 text-primary" />,
      title: t('promiseHoursTitle'),
      body: t('promiseHoursBody'),
    },
  ];

  return (
    <section className="mb-6">
      <h2 className="mb-4 text-xl font-bold text-gray-900 sm:text-2xl">{t('promiseTitle')}</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        {promises.map((p) => (
          <article
            key={p.title}
            className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
          >
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-100">
              {p.icon}
            </div>
            <h3 className="text-base font-semibold text-gray-900">{p.title}</h3>
            <p className="mt-1 text-sm text-gray-600">{p.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function Footer() {
  const t = useTranslations('home');
  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="page-shell flex flex-col items-center justify-between gap-3 py-6 text-xs text-gray-500 sm:flex-row">
        <p>© {new Date().getFullYear()} Quick Easy Mart — Apni Kirana Store</p>
        <p>
          {t('footerHelp')} <a className="font-semibold text-primary hover:text-primary-700" href="mailto:support@quickeasymart.com">support@quickeasymart.com</a>
        </p>
      </div>
    </footer>
  );
}

