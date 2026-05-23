'use client';

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

/**
 * SSR-disabled wrapper around the shared `LocationMap` component. Leaflet
 * touches `window` at module evaluation time (and react-leaflet's
 * `MapContainer` does the same), so importing them on the server would
 * crash the build. Using `next/dynamic({ ssr: false })` defers everything
 * to the client where geolocation + tile rendering actually work.
 *
 * Re-exporting via this thin wrapper means the registration screen and the
 * profile/edit screen import the same component path — keeping the
 * "current-location default" contract in one place.
 */
export const StoreLocationPicker = dynamic(
  () => import('@aks/ui/components/location-map').then((m) => m.LocationMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-72 items-center justify-center rounded-md border border-gray-200 bg-gray-100">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    ),
  },
);
