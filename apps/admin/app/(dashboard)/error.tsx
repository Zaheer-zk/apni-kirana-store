'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * Segment-level error boundary. Next renders this whenever a page in
 * (dashboard) throws during render. Keeps the sidebar usable and gives the
 * admin a clear retry path instead of a blank screen.
 */
export default function DashboardError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  useEffect(() => {
    // Surface to console + the system /errors view (it captures uncaught
    // client-side throws via window.onerror in browsers, but this gives an
    // explicit log line in case the user is watching the JS console).
    console.error('[Admin] Dashboard render error:', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="card max-w-md p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
          <AlertTriangle className="h-6 w-6 text-red-500" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900">Something went wrong</h2>
        <p className="mt-1 text-sm text-gray-500">
          {error.message || 'An unexpected error happened while rendering this page.'}
        </p>
        {error.digest ? (
          <p className="mt-2 font-mono text-xs text-gray-400">digest: {error.digest}</p>
        ) : null}
        <button
          type="button"
          onClick={reset}
          className="btn-primary mt-6 inline-flex items-center gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Try again
        </button>
      </div>
    </div>
  );
}
