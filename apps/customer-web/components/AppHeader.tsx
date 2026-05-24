'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LogIn, LogOut, MapPin, Receipt, Search, ShoppingCart, User } from 'lucide-react';
import { Button } from '@aks/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@aks/ui/components/dropdown-menu';
import { Badge } from '@aks/ui/components/badge';
import { Avatar, AvatarFallback } from '@aks/ui/components/avatar';
import { BrandMark } from './BrandMark';
import { useCart } from '@/lib/cart';
import { clearSession, getStoredUser, type StoredUser } from '@/lib/auth';

/**
 * Top app bar shared across the storefront. Server-renders without a user
 * (avoids hydration flashes) and hydrates the user/cart from localStorage
 * on mount.
 */
export function AppHeader({ showSearch = true }: { showSearch?: boolean }) {
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);
  const itemCount = useCart((s) => s.itemCount());

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  function handleLogout() {
    clearSession();
    setUser(null);
    router.replace('/login');
  }

  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/90 backdrop-blur">
      <div className="page-shell flex h-16 items-center gap-3">
        <Link href="/" aria-label="Quick Easy Mart home" className="flex-shrink-0">
          <BrandMark size="sm" withWordmark />
        </Link>

        {showSearch ? (
          <Link
            href="/search"
            className="ml-auto hidden h-10 max-w-lg flex-1 items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-4 text-sm text-gray-500 transition hover:border-primary-200 hover:bg-white sm:flex"
          >
            <Search className="h-4 w-4 text-primary" />
            Search for rice, soap, paracetamol…
          </Link>
        ) : (
          <div className="ml-auto" />
        )}

        <Link href="/cart" aria-label="View cart" className="relative">
          <Button variant="outline" size="icon">
            <ShoppingCart className="h-5 w-5" />
          </Button>
          {itemCount > 0 ? (
            <Badge
              variant="default"
              className="absolute -right-1.5 -top-1.5 h-5 min-w-5 justify-center rounded-full border-2 border-white px-1 py-0 text-[10px] leading-none"
            >
              {itemCount > 99 ? '99+' : itemCount}
            </Badge>
          ) : null}
        </Link>

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
                    {user.name ?? 'Customer'}
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
                <Link href="/orders" className="flex items-center gap-2">
                  <Receipt className="h-4 w-4" />
                  My orders
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/addresses" className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Saved addresses
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/cart" className="flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4" />
                  Your cart
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/change-password" className="flex items-center gap-2">
                  <User className="h-4 w-4" />
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
            <Link href="/login" className="gap-1">
              <LogIn className="h-4 w-4" />
              Sign in
            </Link>
          </Button>
        )}
      </div>
    </header>
  );
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}
