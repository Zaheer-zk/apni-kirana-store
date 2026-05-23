'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Bell,
  ClipboardList,
  Home,
  LogOut,
  Menu,
  Package,
  Settings,
  Store as StoreIcon,
  User,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@aks/ui/components/button';
import { Badge } from '@aks/ui/components/badge';
import { Avatar, AvatarFallback } from '@aks/ui/components/avatar';
import { Sheet, SheetContent, SheetTrigger } from '@aks/ui/components/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@aks/ui/components/dropdown-menu';
import { toast } from '@aks/ui/components/sonner';
import { BrandMark } from './BrandMark';
import { api } from '@/lib/api';
import {
  clearSession,
  getStoredStore,
  getStoredUser,
  setStoredStore,
  type StoredUser,
} from '@/lib/auth';

/**
 * Responsive app shell shared by every authenticated page (dashboard,
 * inventory, orders, profile). On md+ screens it renders a fixed left
 * sidebar; on mobile the nav becomes a Sheet (drawer) triggered from the
 * top-bar menu icon.
 *
 * Also responsible for:
 *  - Loading the store profile from `/stores/me` if localStorage doesn't
 *    have it (e.g. fresh login on a new device).
 *  - Routing the owner to /register if no store exists yet.
 *  - Open/closed toggle in the top bar.
 */

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** Match strategy — exact path only (`'eq'`) or any path prefix. */
  match?: 'eq' | 'startsWith';
}

const NAV: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: <Home className="h-5 w-5" />, match: 'eq' },
  { href: '/orders', label: 'Orders', icon: <ClipboardList className="h-5 w-5" />, match: 'startsWith' },
  { href: '/inventory', label: 'Inventory', icon: <Package className="h-5 w-5" />, match: 'startsWith' },
  { href: '/profile', label: 'Store profile', icon: <Settings className="h-5 w-5" />, match: 'startsWith' },
];

interface StoreMeResponse {
  id: string;
  name?: string;
  isOpen?: boolean;
  // Permit anything else the backend returns — keeps the `setStoredStore`
  // contract (which uses an index signature) happy without us repeating
  // every Prisma field here.
  [key: string]: unknown;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Hydrate user + store snapshot from localStorage after mount (server can't
  // see localStorage, so SSR renders the anonymous shell first).
  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  // Background-refresh the store profile so /stores/:id/toggle-open knows
  // which store id to hit and the header reflects the latest isOpen.
  const storeQuery = useQuery<StoreMeResponse | null>({
    queryKey: ['storeMe'],
    enabled: !!user,
    queryFn: async () => {
      try {
        const res = await api.get('/api/v1/stores/me');
        const store = (res.data?.data ?? res.data) as StoreMeResponse;
        setStoredStore(store);
        return store;
      } catch (err) {
        // 404 — owner without a store yet → bounce to register so they
        // complete the store-detail step before seeing the dashboard.
        if (err instanceof Error && /no store/i.test(err.message)) {
          router.replace('/register');
        }
        return null;
      }
    },
    staleTime: 60_000,
  });

  const store = storeQuery.data ?? getStoredStore() ?? null;
  const isOpen = !!store?.isOpen;
  const storeId = store?.id;

  const toggleOpenMutation = useMutation({
    mutationFn: async () => {
      if (!storeId) throw new Error('No store profile loaded');
      const res = await api.put(`/api/v1/stores/${storeId}/toggle-open`);
      return res.data?.data ?? res.data;
    },
    onSuccess: (data: { isOpen?: boolean } | null) => {
      const next = !!data?.isOpen;
      setStoredStore({ ...store, isOpen: next });
      queryClient.invalidateQueries({ queryKey: ['storeMe'] });
      toast.success(next ? 'Store is now open for orders' : 'Store is now closed');
    },
    onError: (err: Error) => toast.error(err.message || 'Could not update status'),
  });

  function handleLogout() {
    clearSession();
    router.replace('/login');
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 md:flex-row">
      {/* Desktop sidebar — hidden on mobile */}
      <aside className="hidden w-64 flex-shrink-0 border-r border-gray-200 bg-white md:flex md:flex-col">
        <div className="flex h-16 items-center border-b border-gray-100 px-5">
          <Link href="/" aria-label="Store dashboard home">
            <BrandMark size="sm" withWordmark />
          </Link>
        </div>
        <SideNav pathname={pathname ?? '/'} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-gray-200 bg-white/90 px-4 backdrop-blur sm:px-6">
          {/* Mobile menu trigger */}
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <div className="flex h-16 items-center border-b border-gray-100 px-5">
                <BrandMark size="sm" withWordmark />
              </div>
              <SideNav pathname={pathname ?? '/'} onNavigate={() => setMobileNavOpen(false)} />
            </SheetContent>
          </Sheet>

          {/* Store name (mobile shows in header to compensate for hidden sidebar) */}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <StoreIcon className="hidden h-5 w-5 text-primary md:block" />
            <span className="truncate text-sm font-semibold text-gray-900 sm:text-base">
              {store?.name ?? 'My Store'}
            </span>
          </div>

          {/* Open/Closed toggle pill */}
          <button
            type="button"
            onClick={() => toggleOpenMutation.mutate()}
            disabled={!storeId || toggleOpenMutation.isPending}
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60 ${
              isOpen
                ? 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100'
                : 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
            }`}
            aria-label={isOpen ? 'Store is open. Tap to close.' : 'Store is closed. Tap to open.'}
          >
            <span
              className={`h-2 w-2 rounded-full ${isOpen ? 'bg-green-600' : 'bg-red-600'}`}
              aria-hidden
            />
            {isOpen ? 'Open' : 'Closed'}
          </button>

          {/* Notifications bell — placeholder badge until /notifications ships */}
          <Button variant="ghost" size="icon" aria-label="Notifications" className="hidden sm:inline-flex">
            <Bell className="h-5 w-5" />
          </Button>

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label="Account menu"
                  className="inline-flex items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <Avatar className="h-9 w-9 cursor-pointer">
                    <AvatarFallback>{initials(user.name ?? user.phone)}</AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-gray-900">
                      {user.name ?? 'Store owner'}
                    </span>
                    <span className="text-xs font-normal text-gray-500">+91 {user.phone}</span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/profile/edit" className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Edit store profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/change-password" className="flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    Change password
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                  <LogOut className="h-4 w-4" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button asChild variant="default" size="sm">
              <Link href="/login">Sign in</Link>
            </Button>
          )}
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

function SideNav({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex-1 space-y-1 px-3 py-4">
      {NAV.map((item) => {
        const isActive =
          item.match === 'eq' ? pathname === item.href : pathname.startsWith(item.href) && item.href !== '/';
        const dashboardActive = item.href === '/' && pathname === '/';
        const active = isActive || dashboardActive;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
              active
                ? 'bg-primary-100 text-primary-700'
                : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
            }`}
            aria-current={active ? 'page' : undefined}
          >
            {item.icon}
            {item.label}
            {item.href === '/orders' ? <PendingCountBadge /> : null}
          </Link>
        );
      })}
    </nav>
  );
}

function PendingCountBadge() {
  const { data } = useQuery<number>({
    queryKey: ['storeStatsToday', 'pending'],
    queryFn: async () => {
      try {
        const res = await api.get('/api/v1/stores/stats/today');
        const stats = (res.data?.data ?? res.data) as { pending?: number };
        return stats?.pending ?? 0;
      } catch {
        return 0;
      }
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
  if (!data) return null;
  return (
    <Badge variant="warning" className="ml-auto">
      {data > 99 ? '99+' : data}
    </Badge>
  );
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'S';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}
