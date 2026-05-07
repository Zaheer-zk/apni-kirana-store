'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ShoppingBasket,
  LayoutDashboard,
  Store,
  Bike,
  BookOpen,
  ShoppingCart,
  Users,
  Settings,
  LogOut,
  Ticket,
  Map,
  History,
  Bell,
  X,
} from 'lucide-react';
import { clearToken } from '@/lib/auth';

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
  { href: '/notifications', label: 'Notifications', icon: <Bell className="h-4 w-4" /> },
  { href: '/stores', label: 'Stores', icon: <Store className="h-4 w-4" /> },
  { href: '/drivers', label: 'Drivers', icon: <Bike className="h-4 w-4" /> },
  { href: '/catalog', label: 'Catalog', icon: <BookOpen className="h-4 w-4" /> },
  { href: '/promos', label: 'Promos', icon: <Ticket className="h-4 w-4" /> },
  { href: '/orders', label: 'Orders', icon: <ShoppingCart className="h-4 w-4" /> },
  { href: '/zones', label: 'Zones', icon: <Map className="h-4 w-4" /> },
  { href: '/users', label: 'Users', icon: <Users className="h-4 w-4" /> },
  { href: '/settings', label: 'Settings', icon: <Settings className="h-4 w-4" /> },
  { href: '/audit-logs', label: 'Audit Logs', icon: <History className="h-4 w-4" /> },
];

interface SidebarProps {
  /**
   * When true, the mobile drawer is open. Ignored at lg+ where the
   * sidebar is always visible as a fixed column.
   */
  mobileOpen?: boolean;
  /** Called when the user requests to close the drawer (link tap, X, backdrop, Escape). */
  onClose?: () => void;
}

export default function Sidebar({ mobileOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  function isActive(href: string) {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  }

  function handleLogout() {
    clearToken();
    router.replace('/login');
  }

  function handleNavClick() {
    onClose?.();
  }

  // Close on Escape (only when drawer is open).
  useEffect(() => {
    if (!mobileOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose?.();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen, onClose]);

  // Lock body scroll while drawer is open on small screens.
  useEffect(() => {
    if (!mobileOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [mobileOpen]);

  return (
    <>
      {/* Backdrop — visible only on mobile when drawer is open */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`fixed inset-0 z-30 bg-gray-900/40 transition-opacity lg:hidden ${
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      <aside
        className={`fixed left-0 top-0 z-40 flex h-full w-[260px] max-w-[85vw] flex-col border-r border-gray-200 bg-white transition-transform duration-200 ease-out lg:w-60 lg:max-w-none lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
        aria-label="Primary navigation"
      >
        {/* Logo + mobile close */}
        <div className="flex items-center justify-between gap-2.5 border-b border-gray-100 px-5 py-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary shadow-sm">
              <ShoppingBasket className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold leading-tight text-gray-900">Apni Kirana</p>
              <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
                Admin Panel
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="-mr-1 inline-flex h-9 w-9 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-0.5">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={handleNavClick}
                  className={`flex min-h-[44px] items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive(item.href)
                      ? 'bg-primary-50 text-primary'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <span className={isActive(item.href) ? 'text-primary' : 'text-gray-400'}>
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Logout */}
        <div className="border-t border-gray-100 p-3">
          <button
            onClick={handleLogout}
            className="flex min-h-[44px] w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-red-50 hover:text-red-600"
          >
            <LogOut className="h-4 w-4 text-gray-400" />
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
