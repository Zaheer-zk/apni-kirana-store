'use client';

import { Suspense, useState } from 'react';
import { Menu, ShoppingBasket } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import NotificationBell from '@/components/NotificationBell';
import EnableNotificationsBanner from '@/components/EnableNotificationsBanner';
import NavProgressBar from '@/components/NavProgressBar';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Suspense fallback={null}>
        <NavProgressBar />
      </Suspense>
      {/* Sidebar — always rendered. On mobile it's a slide-in drawer; on lg+ it's fixed. */}
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

      {/* Main content — offset by sidebar width on lg+. */}
      <main className="flex w-full min-w-0 flex-1 flex-col overflow-x-hidden lg:ml-60">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-gray-200 bg-white px-3 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="inline-flex h-11 w-11 items-center justify-center rounded-md text-gray-700 hover:bg-gray-100"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex flex-1 items-center justify-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
              <ShoppingBasket className="h-3.5 w-3.5 text-white" />
            </div>
            <p className="text-sm font-semibold text-gray-900">Apni Kirana Admin</p>
          </div>
          <NotificationBell />
        </header>

        {/* Desktop top bar — visible only at lg+ to host the bell on the right. */}
        <header className="sticky top-0 z-20 hidden h-14 items-center justify-end border-b border-gray-200 bg-white px-6 lg:flex">
          <NotificationBell />
        </header>

        <EnableNotificationsBanner />

        <div className="min-w-0 flex-1 p-4 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
