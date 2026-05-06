import Link from 'next/link';
import { ShoppingBasket, Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10">
          <ShoppingBasket className="h-10 w-10 text-primary" />
        </div>
        <p className="text-sm font-semibold text-primary">404 — Page not found</p>
        <h1 className="mt-2 text-3xl font-bold text-gray-900">
          We couldn&apos;t find that page
        </h1>
        <p className="mt-3 text-base text-gray-600">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link href="/" className="btn-primary">
            <Home className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Link>
          <Link href="/stores" className="btn-secondary">
            View Stores
          </Link>
        </div>
      </div>
    </div>
  );
}
