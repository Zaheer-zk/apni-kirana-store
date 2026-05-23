'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
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
        <SearchEntry />
        <FeaturedSection />
        <PromiseGrid />
      </main>
      <Footer />
    </>
  );
}

function Hero() {
  return (
    <section className="relative mb-8 overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-primary-700 px-6 py-10 text-white shadow-md sm:px-10 sm:py-14">
      <div className="relative z-10 max-w-xl">
        <Badge variant="warning" className="mb-3">
          New · Order from your neighbourhood store
        </Badge>
        <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
          Daily essentials, delivered in 30 minutes.
        </h1>
        <p className="mt-3 text-sm text-primary-100 sm:text-base">
          Quick Easy Mart connects you to your nearest kirana store. Fresh produce, medicines and
          household items — same prices, same store, faster delivery.
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
          placeholder="Search for rice, soap, paracetamol…"
          aria-label="Search items"
          className="flex-1 bg-transparent text-base text-gray-900 placeholder:text-gray-400 focus:outline-none"
        />
        <Button onClick={() => go()} disabled={!query.trim()}>
          Search
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-gray-500">Trending:</span>
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
          <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">Popular near you</h2>
          <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
            <MapPin className="h-3 w-3" />
            {status === 'granted' ? 'Using your current location' : 'Using a default Delhi location'}
          </p>
        </div>
        <Link href="/search" className="text-sm font-semibold text-primary hover:text-primary-700">
          View all
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
          message="Couldn't load nearby items right now."
          onRetry={() => featuredQuery.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyPanel
          icon={<Search className="h-6 w-6" />}
          title="Nothing nearby yet"
          subtitle="Stores in your area haven't listed items yet. Search for something specific to try a wider radius."
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
  const promises = [
    {
      icon: <Bike className="h-6 w-6 text-primary" />,
      title: 'Lightning-fast delivery',
      body: 'Average 30-minute drop-off from your nearest store.',
    },
    {
      icon: <ShieldCheck className="h-6 w-6 text-primary" />,
      title: 'Same kirana, same prices',
      body: 'No middleman markup — you pay the store price.',
    },
    {
      icon: <Clock3 className="h-6 w-6 text-primary" />,
      title: 'Open early, open late',
      body: 'Order whenever a store nearby is open. Cash on delivery accepted.',
    },
  ];

  return (
    <section className="mb-6">
      <h2 className="mb-4 text-xl font-bold text-gray-900 sm:text-2xl">The Quick Easy Mart promise</h2>
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
  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="page-shell flex flex-col items-center justify-between gap-3 py-6 text-xs text-gray-500 sm:flex-row">
        <p>© {new Date().getFullYear()} Quick Easy Mart — Apni Kirana Store</p>
        <p>
          Need help? Email <a className="font-semibold text-primary hover:text-primary-700" href="mailto:support@quickeasymart.com">support@quickeasymart.com</a>
        </p>
      </div>
    </footer>
  );
}

