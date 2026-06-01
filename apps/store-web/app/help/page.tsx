'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, ListPlus, LifeBuoy, Inbox, Clock } from 'lucide-react';
import { Card, CardContent } from '@aks/ui/components/card';
import { Badge } from '@aks/ui/components/badge';
import { AuthGuard } from '@/components/AuthGuard';
import { AppShell } from '@/components/AppShell';
import { api, unwrapList } from '@/lib/api';

// Help screen surfaces:
//   - Quick action: raise a new catalog item request
//   - Recent request status (so store owners don't re-submit the same item)
//   - Static FAQ
//
// Deliberately lightweight — this is the entry point, not a full support
// system. The actual "raise request" form lives at /inventory/request-item.
export default function HelpPage() {
  return (
    <AuthGuard>
      <AppShell>
        <HelpInner />
      </AppShell>
    </AuthGuard>
  );
}

interface CatalogRequest {
  id: string;
  name: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewNote?: string | null;
  createdAt: string;
  catalogItem?: { id: string; name: string } | null;
}

function HelpInner() {
  const { data: myReqs } = useQuery<CatalogRequest[]>({
    queryKey: ['catalogRequestsMine'],
    queryFn: async () => {
      const res = await api.get('/api/v1/catalog/requests/mine');
      return unwrapList<CatalogRequest>(res.data);
    },
    staleTime: 30_000,
  });

  const recent = (myReqs ?? []).slice(0, 5);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex items-center gap-3">
        <LifeBuoy className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold text-gray-900">Help &amp; FAQs</h1>
      </header>

      {/* Primary CTA — request-an-item, prominent so it doesn't get lost. */}
      <Link
        href="/inventory/request-item"
        className="block rounded-2xl border border-primary/30 bg-primary/5 p-5 transition hover:bg-primary/10"
      >
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-primary p-3 text-primary-foreground">
            <ListPlus className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-gray-900">Request a new catalog item</h2>
            <p className="mt-1 text-sm text-gray-600">
              Can&apos;t find what you sell? Send a request — admin reviews and adds it to the
              master catalog, then it appears in your inventory automatically.
            </p>
          </div>
          <ChevronRight className="h-5 w-5 text-gray-400" />
        </div>
      </Link>

      {/* Recent requests */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          <Inbox className="h-4 w-4" />
          Your recent requests
        </h2>
        {recent.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-sm text-gray-500">
              No requests yet. Use the button above to add an item you sell that isn&apos;t in our
              catalog.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="divide-y divide-gray-100 p-0">
              {recent.map((r) => (
                <RequestRow key={r.id} req={r} />
              ))}
            </CardContent>
          </Card>
        )}
      </section>

      {/* Static FAQ */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">FAQs</h2>
        <Faq
          q="How long does a catalog request take?"
          a="Usually within a day. Admin checks the name, description, and category, then approves or rejects with a short note. You'll get a notification either way."
        />
        <Faq
          q="My catalog request was approved — where is the item?"
          a="It's already in your inventory at the price you suggested (or zero if you didn't enter one). Open Inventory → find the item → set the right price and stock count."
        />
        <Faq
          q="How do I receive orders?"
          a="Make sure your store location (latitude + longitude) is set in Profile → Edit, and that you've toggled the store Open from the top bar. The matching engine routes orders only to open stores with a known location."
        />
        <Faq
          q="A customer cancelled — what happens to their payment?"
          a="If they paid online, it goes back to their wallet automatically. COD orders that cancel before pickup just clear without any money movement."
        />
        <Faq
          q="How does platform commission work?"
          a="A small percentage of every accepted order goes to platform fees (visible in Settings). The rest credits your wallet at delivery completion. Withdraw via Earnings → Request payout."
        />
      </section>
    </div>
  );
}

function RequestRow({ req }: { req: CatalogRequest }) {
  const variant: 'warning' | 'success' | 'destructive' =
    req.status === 'PENDING' ? 'warning' : req.status === 'APPROVED' ? 'success' : 'destructive';
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <Clock className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-gray-900">{req.name}</p>
          <Badge variant={variant}>{req.status}</Badge>
        </div>
        {req.reviewNote ? (
          <p className="mt-0.5 text-xs text-gray-500">Admin note: {req.reviewNote}</p>
        ) : null}
        {req.catalogItem ? (
          <Link
            href="/inventory"
            className="mt-0.5 inline-block text-xs font-medium text-primary hover:underline"
          >
            View in inventory →
          </Link>
        ) : null}
      </div>
      <span className="flex-shrink-0 text-xs text-gray-400">
        {new Date(req.createdAt).toLocaleDateString()}
      </span>
    </div>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <details className="group rounded-xl border border-gray-200 bg-white p-4 transition hover:border-gray-300">
      <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm font-medium text-gray-900">
        {q}
        <ChevronRight className="h-4 w-4 text-gray-400 transition group-open:rotate-90" />
      </summary>
      <p className="mt-2 text-sm leading-relaxed text-gray-600">{a}</p>
    </details>
  );
}
