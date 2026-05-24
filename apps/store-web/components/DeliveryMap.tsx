'use client';

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

/**
 * Client-only wrapper around DeliveryMapInner. Leaflet touches `window` at
 * module evaluation, so SSR has to be disabled. Mirrors the wrapper pattern
 * used by `StoreLocationPicker.tsx`.
 */
export const DeliveryMap = dynamic(() => import('./DeliveryMapInner'), {
  ssr: false,
  loading: () => (
    <div className="flex h-72 items-center justify-center rounded-md border border-gray-200 bg-gray-100">
      <Loader2 className="h-5 w-5 animate-spin text-primary" />
    </div>
  ),
});
