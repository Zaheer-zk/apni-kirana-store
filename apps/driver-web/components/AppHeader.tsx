'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  IndianRupee,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  User,
} from 'lucide-react';
import { Button } from '@aks/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@aks/ui/components/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@aks/ui/components/sheet';
import { Avatar, AvatarFallback } from '@aks/ui/components/avatar';
import { cn } from '@aks/ui/lib/utils';
import { BrandMark } from './BrandMark';
import { HeaderOnlineToggle } from './HeaderOnlineToggle';
import { clearSession, getStoredUser, type StoredUser } from '@/lib/auth';

const NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/deliveries', label: 'Deliveries', icon: ListChecks },
  { href: '/earnings', label: 'Earnings', icon: IndianRupee },
  { href: '/profile', label: 'Profile', icon: User },
] as const;

/**
 * Shared top app bar for authenticated driver pages. Mobile-first — left
 * burger opens a Sheet with the same nav, right-side avatar dropdown holds
 * change-password and sign-out actions.
 */
export function AppHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  function handleLogout() {
    clearSession();
    router.replace('/login');
  }

  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/90 backdrop-blur">
      <div className="page-shell flex h-16 items-center gap-3">
        {/* Mobile burger */}
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="md:hidden" aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <SheetHeader className="border-b border-gray-200 p-4">
              <SheetTitle className="flex items-center">
                <BrandMark size="sm" withWordmark />
              </SheetTitle>
            </SheetHeader>
            <nav className="flex flex-col p-2">
              {NAV.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setSheetOpen(false)}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium',
                      active
                        ? 'bg-primary-50 text-primary'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </SheetContent>
        </Sheet>

        <Link href="/" aria-label="AKS Driver home" className="flex-shrink-0">
          <BrandMark size="sm" withWordmark />
        </Link>

        {/* Desktop nav */}
        <nav className="ml-6 hidden items-center gap-1 md:flex">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium',
                  active
                    ? 'bg-primary-50 text-primary'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto" />

        {/* Status pill — hidden when there's no auth user (rare here since
            AppHeader is only rendered behind RequireAuth, but the parent
            avatar block below has the same guard). */}
        {user ? <HeaderOnlineToggle /> : null}

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
                    {user.name ?? 'Driver'}
                  </span>
                  <span className="text-xs font-normal text-gray-500">+91 {user.phone}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/profile" className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/change-password" className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Change password
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleLogout}
                className="text-destructive focus:text-destructive"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button asChild variant="default" size="sm">
            <Link href="/login">Sign in</Link>
          </Button>
        )}
      </div>
    </header>
  );
}

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'D';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}
