'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { Loader2, MapPin } from 'lucide-react';
import { Button } from '@aks/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@aks/ui/components/dialog';
import { Input } from '@aks/ui/components/input';
import { Label } from '@aks/ui/components/label';
import { api, unwrap } from '@/lib/api';
import type { CartRecipient } from '@/lib/cart';

// Same lazy-leaflet trick as AddressFormDialog — react-leaflet reads
// `window` at import time so it'd blow up under SSR.
const LocationMap = dynamic(
  () => import('@aks/ui/components/location-map').then((m) => m.LocationMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-56 items-center justify-center rounded-md border border-gray-200 bg-gray-100">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    ),
  },
);

interface RecipientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: CartRecipient | null;
  onSave: (recipient: CartRecipient) => void;
}

interface RecipientLookupResponse {
  exists: boolean;
  isSelf: boolean;
  name: string | null;
}

/**
 * Collects the recipient details when the customer flips "ordering for
 * someone else" on the cart screen. Three responsibilities:
 *
 *   1. Capture name / phone / email — we always need contact info so the
 *      driver and store can reach the recipient at dropoff.
 *   2. On phone blur, call GET /users/recipient-lookup to detect whether
 *      the recipient is already a registered customer. We DON'T fetch
 *      their saved addresses (privacy — they may not want their home
 *      shared with anyone who knows their phone). We just badge the row
 *      "Existing user · Ramesh" so the sender knows they're sending to
 *      a real account on the platform.
 *   3. Capture the delivery address inline — street/city/state/pincode +
 *      lat/lng via the same Leaflet picker the AddressFormDialog uses.
 *      That lat/lng drives backend zone lookup → store + driver search.
 *
 * The dialog NEVER mutates the customer's saved address book. The
 * address is persisted only when the order is created (POST /orders
 * with `recipientAddress` payload, which the backend turns into a
 * non-default Address row labelled "For <recipientName>").
 */
export function RecipientDialog({
  open,
  onOpenChange,
  initial,
  onSave,
}: RecipientDialogProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);

  const [lookup, setLookup] = useState<RecipientLookupResponse | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill from existing recipient when the dialog opens — lets the
  // customer edit without re-entering everything.
  useEffect(() => {
    if (!open) return;
    if (initial?.mode !== 'someone_else') {
      setName('');
      setPhone('');
      setEmail('');
      setStreet('');
      setCity('');
      setState('');
      setPincode('');
      setLat(null);
      setLng(null);
      setLookup(null);
      setError(null);
      return;
    }
    setName(initial.name ?? '');
    setPhone(initial.phone ?? '');
    setEmail(initial.email ?? '');
    setStreet(initial.address?.street ?? '');
    setCity(initial.address?.city ?? '');
    setState(initial.address?.state ?? '');
    setPincode(initial.address?.pincode ?? '');
    setLat(initial.address?.lat ?? null);
    setLng(initial.address?.lng ?? null);
    setLookup({
      exists: !!initial.existsInDb,
      isSelf: false,
      name: initial.existsInDb ? (initial.name ?? null) : null,
    });
    setError(null);
  }, [open, initial]);

  async function runLookup(phoneVal: string) {
    if (!/^\d{10}$/.test(phoneVal)) {
      setLookup(null);
      return;
    }
    setLookingUp(true);
    try {
      const res = await api.get(
        `/api/v1/users/recipient-lookup?phone=${phoneVal}`,
      );
      const data = unwrap<RecipientLookupResponse>(res.data);
      setLookup(data);
      // If the lookup returned a name (existing user) AND the sender
      // hasn't typed one yet, helpful to pre-fill — they can still
      // override.
      if (data.exists && data.name && !name) setName(data.name);
    } catch {
      // Soft-fail: lookup is a UX nicety, not a gate. Order can still
      // proceed without it.
      setLookup(null);
    } finally {
      setLookingUp(false);
    }
  }

  function handleSubmit() {
    setError(null);
    if (!name.trim()) return setError("Enter the recipient's name");
    if (!/^\d{10}$/.test(phone))
      return setError("Recipient phone must be 10 digits");
    if (street.trim().length < 3) return setError('Enter a street address');
    if (!city.trim()) return setError('Enter a city');
    if (!state.trim()) return setError('Enter a state');
    if (!/^\d{6}$/.test(pincode)) return setError('Pincode must be 6 digits');
    if (lat == null || lng == null)
      return setError('Pick the delivery location on the map');

    onSave({
      mode: 'someone_else',
      name: name.trim(),
      phone,
      email: email.trim() || undefined,
      existsInDb: lookup?.exists ?? false,
      address: {
        label: `For ${name.trim().slice(0, 40)}`,
        street: street.trim(),
        city: city.trim(),
        state: state.trim(),
        pincode,
        lat,
        lng,
      },
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Order for someone else</DialogTitle>
          <DialogDescription>
            We'll deliver to this recipient's address. Their zone decides
            which store fulfils the order and which driver carries it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="rcp-name">Recipient name</Label>
              <Input
                id="rcp-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ramesh Singh"
                maxLength={100}
              />
            </div>
            <div>
              <Label htmlFor="rcp-phone">10-digit phone</Label>
              <Input
                id="rcp-phone"
                inputMode="numeric"
                value={phone}
                onChange={(e) => {
                  const next = e.target.value.replace(/\D/g, '').slice(0, 10);
                  setPhone(next);
                  if (next.length !== 10) setLookup(null);
                }}
                onBlur={() => runLookup(phone)}
                placeholder="9876543210"
                maxLength={10}
              />
              {lookingUp ? (
                <p className="mt-1 inline-flex items-center gap-1 text-xs text-gray-500">
                  <Loader2 className="h-3 w-3 animate-spin" /> Checking…
                </p>
              ) : lookup?.isSelf ? (
                <p className="mt-1 text-xs text-amber-600">
                  That's your own number — use "ordering for myself" instead.
                </p>
              ) : lookup?.exists ? (
                <p className="mt-1 text-xs text-emerald-700">
                  Existing customer · {lookup.name ?? 'on Quick Easy Mart'}
                </p>
              ) : lookup ? (
                <p className="mt-1 text-xs text-gray-500">
                  New recipient — we'll text them the tracking link.
                </p>
              ) : null}
            </div>
          </div>

          <div>
            <Label htmlFor="rcp-email">Email (optional)</Label>
            <Input
              id="rcp-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ramesh@example.com"
              maxLength={200}
            />
          </div>

          <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
            <p className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
              <MapPin className="h-3 w-3" /> Recipient delivery address
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Input
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                placeholder="House / street"
                maxLength={200}
              />
              <Input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="City"
                maxLength={80}
              />
              <Input
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="State"
                maxLength={80}
              />
              <Input
                inputMode="numeric"
                value={pincode}
                onChange={(e) =>
                  setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))
                }
                placeholder="6-digit pincode"
                maxLength={6}
              />
            </div>

            <div className="mt-3">
              <LocationMap
                fallback={lat != null && lng != null ? { lat, lng } : null}
                heightClass="h-56"
                onChange={({ lat: nextLat, lng: nextLng }) => {
                  setLat(nextLat);
                  setLng(nextLng);
                }}
              />
              <p className="mt-1 text-[11px] text-gray-500">
                {lat != null && lng != null
                  ? `${lat.toFixed(5)}, ${lng.toFixed(5)}`
                  : 'Drag the pin to the exact delivery spot — this decides the zone we search.'}
              </p>
            </div>
          </div>

          {error ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          ) : null}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>Save recipient</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
