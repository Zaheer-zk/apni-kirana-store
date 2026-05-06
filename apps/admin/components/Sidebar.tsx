'use client';

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
} from 'lucide-react';
import { clearToken } from '@/lib/auth';

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
  { href: '/stores', label: 'Stores', icon: <Store className="h-4 w-4" /> },
  { href: '/drivers', label: 'Drivers', icon: <Bike className="h-4 w-4" /> },
  { href: '/catalog', label: 'Catalog', icon: <BookOpen className="h-4 w-4" /> },
  { href: '/promos', label: 'Promos', icon: <Ticket className="h-4 w-4" /> },
  { href: '/orders', label: 'Orders', icon: <ShoppingCart className="h-4 w-4" /> },
  { href: '/users', label: 'Users', icon: <Users className="h-4 w-4" /> },
  { href: '/settings', label: 'Settings', icon: <Settings className="h-4 w-4" /> },
];

export default function Sidebar() {
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

  return (
    <aside className="fixed left-0 top-0 h-full w-60 flex flex-col bg-white border-r border-gray-200 z-40">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-gray-100">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary shadow-sm">
          <ShoppingBasket className="h-4 w-4 text-white" />
        </div>
        <div>
          <p className="text-sm font-bold text-gray-900 leading-tight">Apni Kirana</p>
          <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Admin Panel</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
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
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <LogOut className="h-4 w-4 text-gray-400" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
