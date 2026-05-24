'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  CircleAlert,
  CreditCard,
  Loader2,
  Lock,
  MapPin,
  Plus,
  ShoppingBag,
  Wallet,
} from 'lucide-react';
import { Button } from '@aks/ui/components/button';
import { Card, CardContent } from '@aks/ui/components/card';
import { Separator } from '@aks/ui/components/separator';
import { toast } from '@aks/ui/components/sonner';
import { PaymentMethod } from '@aks/shared';
import { AppHeader } from '@/components/AppHeader';
import { AddressCard } from '@/components/AddressCard';
import { AddressFormDialog } from '@/components/AddressFormDialog';
import { EmptyPanel, ErrorPanel, PageLoader } from '@/components/StatePanels';
import {
  createAddress,
  fetchAddresses,
  type AddressFormInput,
  type SavedAddress,
} from '@/lib/addresses';
import { useCart } from '@/lib/cart';
import { createOrder } from '@/lib/orders';
import { rupees } from '@/lib/format';
import { useUser } from '@/lib/use-user';

// Same hard-coded fallback as the cart screen. The backend recomputes the
// real number from PlatformSettings + distance once the order is placed.
const FALLBACK_DELIVERY_FEE = 30;

export default function CheckoutPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, mounted } = useUser({ redirectTo: '/checkout' });

  const items = useCart((s) => s.items);
  const store = useCart((s) => s.store);
  const subtotal = useCart((s) => s.subtotal());
  const itemCount = useCart((s) => s.itemCount());
  const clearCart = useCart((s) => s.clear);

  const addressesQuery = useQuery({
    queryKey: ['addresses'],
    queryFn: fetchAddresses,
    enabled: !!user,
  });

  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.CASH_ON_DELIVERY);
  const [addressDialogOpen, setAddressDialogOpen] = useState(false);

  // Pre-select the default address once it loads.
  useEffect(() => {
    if (!selectedAddressId && addressesQuery.data?.length) {
      const fallback = addressesQuery.data.find((a) => a.isDefault) ?? addressesQuery.data[0];
      if (fallback) setSelectedAddressId(fallback.id);
    }
  }, [addressesQuery.data, selectedAddressId]);

  const createAddrMutation = useMutation({
    mutationFn: (input: AddressFormInput) => createAddress(input),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['addresses'] });
      setSelectedAddressId(saved.id);
      toast.success('Address added');
    },
  });

  const placeOrderMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAddressId) throw new Error('Choose a delivery address');
      if (!store) throw new Error('Cart is empty');
      if (items.length === 0) throw new Error('Cart is empty');

      return createOrder({
        storeId: store.storeId,
        deliveryAddressId: selectedAddressId,
        paymentMethod,
        items: items.map((line) => ({ storeItemId: line.storeItemId, qty: line.qty })),
      });
    },
    onSuccess: (order) => {
      clearCart();
      toast.success('Order placed!');
      router.push(`/orders/${order.id}`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not place order'),
  });

  // Empty-cart guard — once mounted (post-hydration), bounce to /cart.
  useEffect(() => {
    if (!mounted) return;
    if (items.length === 0 && !placeOrderMutation.isPending && !placeOrderMutation.isSuccess) {
      // Don't loop if the user already paid: the success handler clears the
      // cart, but we redirect away in onSuccess so this is purely the
      // "user navigated to /checkout with nothing in cart" case.
      router.replace('/cart');
    }
  }, [mounted, items.length, router, placeOrderMutation.isPending, placeOrderMutation.isSuccess]);

  if (!mounted || !user) {
    return (
      <>
        <AppHeader showSearch={false} />
        <main className="page-shell py-10">
          <PageLoader />
        </main>
      </>
    );
  }

  if (items.length === 0) {
    return (
      <>
        <AppHeader showSearch={false} />
        <main className="page-shell py-10">
          <EmptyPanel
            icon={<ShoppingBag className="h-6 w-6" />}
            title="Your cart is empty"
            subtitle="Add items first, then come back to check out."
            action={
              <Button asChild>
                <Link href="/">Browse items</Link>
              </Button>
            }
          />
        </main>
      </>
    );
  }

  const addresses = addressesQuery.data ?? [];
  const selectedAddress = addresses.find((a) => a.id === selectedAddressId) ?? null;
  const total = subtotal + FALLBACK_DELIVERY_FEE;
  const canPlace =
    !!selectedAddressId &&
    items.length > 0 &&
    !placeOrderMutation.isPending &&
    !createAddrMutation.isPending;

  return (
    <>
      <AppHeader showSearch={false} />
      <main className="page-shell py-6">
        <Button variant="ghost" asChild className="-ml-2 mb-3">
          <Link href="/cart">
            <ChevronLeft className="h-4 w-4" />
            Back to cart
          </Link>
        </Button>

        <header className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Checkout</h1>
          <p className="mt-1 text-sm text-gray-500">
            {itemCount} item{itemCount === 1 ? '' : 's'} from {store?.storeName ?? 'your store'}
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <section className="space-y-6">
            {/* Step 1: address */}
            <StepBlock step={1} title="Delivery address" icon={<MapPin className="h-5 w-5" />}>
              {addressesQuery.isLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              ) : addressesQuery.isError ? (
                <ErrorPanel
                  message={
                    addressesQuery.error instanceof Error
                      ? addressesQuery.error.message
                      : 'Could not load addresses.'
                  }
                  onRetry={() => addressesQuery.refetch()}
                />
              ) : addresses.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
                  <p className="text-sm text-gray-700">No saved addresses yet.</p>
                  <Button onClick={() => setAddressDialogOpen(true)} className="mt-3">
                    <Plus className="h-4 w-4" />
                    Add an address
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {addresses.map((addr) => (
                    <AddressCard
                      key={addr.id}
                      address={addr}
                      selectable
                      selected={addr.id === selectedAddressId}
                      onSelect={() => setSelectedAddressId(addr.id)}
                    />
                  ))}
                  <Button
                    variant="outline"
                    onClick={() => setAddressDialogOpen(true)}
                    className="w-full"
                  >
                    <Plus className="h-4 w-4" />
                    Add a new address
                  </Button>
                </div>
              )}
            </StepBlock>

            {/* Step 2: payment */}
            <StepBlock step={2} title="Payment method" icon={<Wallet className="h-5 w-5" />}>
              <div className="space-y-3">
                <PaymentOption
                  selected={paymentMethod === PaymentMethod.CASH_ON_DELIVERY}
                  onSelect={() => setPaymentMethod(PaymentMethod.CASH_ON_DELIVERY)}
                  title="Cash on delivery"
                  subtitle="Pay the driver in cash or UPI when your order arrives."
                  icon={<Wallet className="h-5 w-5" />}
                />
                <PaymentOption
                  selected={false}
                  disabled
                  onSelect={() => undefined}
                  title="Online payment"
                  subtitle="UPI / cards via Razorpay. Coming soon."
                  icon={<CreditCard className="h-5 w-5" />}
                  badge="Coming soon"
                />
              </div>
            </StepBlock>

            {/* Step 3: review */}
            <StepBlock step={3} title="Review your order" icon={<ShoppingBag className="h-5 w-5" />}>
              <Card>
                <CardContent className="p-0">
                  <ul className="divide-y divide-gray-100">
                    {items.map((line) => (
                      <li key={line.storeItemId} className="flex items-center gap-3 p-3 sm:p-4">
                        <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-md bg-gray-100">
                          {line.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={line.imageUrl}
                              alt={line.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100 text-base font-bold text-primary-700">
                              {line.name.slice(0, 1).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-gray-900">{line.name}</p>
                          <p className="text-xs text-gray-500">
                            {line.qty} × {rupees(line.price)} · {line.unit}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-gray-900">
                          {rupees(line.qty * line.price)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </StepBlock>
          </section>

          {/* Sticky summary */}
          <aside className="space-y-3 lg:sticky lg:top-20 lg:self-start">
            <Card>
              <CardContent className="space-y-3 p-5">
                <h2 className="text-base font-semibold text-gray-900">Order summary</h2>
                <Row label={`Subtotal (${itemCount})`} value={rupees(subtotal)} />
                <Row label="Delivery fee (est.)" value={rupees(FALLBACK_DELIVERY_FEE)} />
                <Separator />
                <Row label="Total" value={rupees(total)} bold />
                <p className="text-[11px] leading-snug text-gray-500">
                  Final delivery fee is set by the store based on distance and may vary by a few
                  rupees.
                </p>

                {!selectedAddress ? (
                  <p className="inline-flex items-start gap-1 text-xs text-amber-700">
                    <CircleAlert className="mt-0.5 h-3.5 w-3.5" />
                    Choose a delivery address to continue
                  </p>
                ) : null}

                <Button
                  size="lg"
                  className="w-full"
                  onClick={() => placeOrderMutation.mutate()}
                  loading={placeOrderMutation.isPending}
                  disabled={!canPlace}
                >
                  <Lock className="h-4 w-4" />
                  Place order · {rupees(total)}
                </Button>
              </CardContent>
            </Card>
          </aside>
        </div>

        <AddressFormDialog
          open={addressDialogOpen}
          onOpenChange={setAddressDialogOpen}
          onSubmit={async (input) => {
            await createAddrMutation.mutateAsync(input);
          }}
          submitting={createAddrMutation.isPending}
          hideDefaultToggle={addresses.length === 0}
        />
      </main>
    </>
  );
}

function StepBlock({
  step,
  title,
  icon,
  children,
}: {
  step: number;
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <header className="mb-3 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-sm font-bold text-primary-700">
          {step}
        </div>
        <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
          {icon}
          {title}
        </h2>
      </header>
      {children}
    </section>
  );
}

function PaymentOption({
  selected,
  onSelect,
  title,
  subtitle,
  icon,
  disabled = false,
  badge,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  disabled?: boolean;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={[
        'flex w-full items-start gap-3 rounded-xl border bg-white p-4 text-left transition',
        selected ? 'border-primary ring-1 ring-primary/30' : 'border-gray-200 hover:border-primary-200',
        disabled ? 'cursor-not-allowed opacity-60' : '',
      ].join(' ')}
    >
      <div
        className={[
          'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full',
          selected ? 'bg-primary text-primary-foreground' : 'bg-gray-100 text-gray-600',
        ].join(' ')}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-gray-900">{title}</p>
          {badge ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
              {badge}
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>
      </div>
    </button>
  );
}

function Row({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-baseline justify-between text-sm">
      <span className={bold ? 'font-semibold text-gray-900' : 'text-gray-600'}>{label}</span>
      <span className={bold ? 'text-lg font-bold text-gray-900' : 'text-gray-900'}>{value}</span>
    </div>
  );
}
