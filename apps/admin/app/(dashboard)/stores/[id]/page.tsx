'use client';

import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Star, Package, ShoppingBag, MapPin, Phone, User } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import StatusBadge from '@/components/StatusBadge';
import type { StoreProfile, InventoryItem, Order } from '@aks/shared';
import { OrderStatus } from '@aks/shared';

interface StoreDetail extends StoreProfile {
  ownerName: string;
  ownerPhone: string;
  city: string;
  state: string;
  pincode: string;
  totalOrders: number;
  totalRevenue: number;
  createdAt: string;
}

interface StoreDetailResponse {
  store: StoreDetail;
  items: InventoryItem[];
  recentOrders: (Order & { customerName: string })[];
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 text-gray-400">{icon}</div>
      <div>
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-sm font-medium text-gray-900">{value}</p>
      </div>
    </div>
  );
}

export default function StoreDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const { data, isLoading, isError } = useQuery<StoreDetailResponse>({
    queryKey: ['admin-store', id],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: StoreDetailResponse }>(
        `/api/v1/admin/stores/${id}`
      );
      return res.data.data!;
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 rounded bg-gray-200" />
        <div className="grid grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card h-48 p-6" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="py-20 text-center">
        <p className="text-red-500">Failed to load store details.</p>
        <Link href="/stores" className="mt-4 inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to Stores
        </Link>
      </div>
    );
  }

  const { store, items, recentOrders } = data;

  return (
    <div className="space-y-7">
      {/* Back + header */}
      <div>
        <Link href="/stores" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
          <ArrowLeft className="h-4 w-4" /> Back to Stores
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{store.name}</h1>
            <p className="mt-1 text-sm text-gray-500">{store.category}</p>
          </div>
          <StatusBadge status={store.status} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Store info */}
        <div className="card p-6 space-y-4 lg:col-span-1">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Store Info</h2>
          <InfoRow icon={<User className="h-4 w-4" />} label="Owner" value={store.ownerName} />
          <InfoRow icon={<Phone className="h-4 w-4" />} label="Phone" value={store.ownerPhone} />
          <InfoRow icon={<MapPin className="h-4 w-4" />} label="Address" value={store.address} />
          <InfoRow icon={<MapPin className="h-4 w-4" />} label="City" value={`${store.city}, ${store.state} — ${store.pincode}`} />
          <InfoRow
            icon={<Star className="h-4 w-4" />}
            label="Rating"
            value={`${store.rating.toFixed(1)} / 5.0`}
          />
          <InfoRow
            icon={<ShoppingBag className="h-4 w-4" />}
            label="Total Orders"
            value={store.totalOrders.toLocaleString('en-IN')}
          />
          <InfoRow
            icon={<Package className="h-4 w-4" />}
            label="Total Revenue"
            value={`₹${store.totalRevenue.toLocaleString('en-IN')}`}
          />
          <div className="pt-2 border-t border-gray-100 text-xs text-gray-400">
            Registered on {new Date(store.createdAt).toLocaleDateString('en-IN', { dateStyle: 'long' })}
          </div>
        </div>

        {/* Items */}
        <div className="card overflow-hidden lg:col-span-2">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">Inventory ({items.length} items)</h2>
          </div>
          {items.length === 0 ? (
            <p className="px-6 py-10 text-sm text-gray-400 text-center">No items listed yet.</p>
          ) : (
            <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
              {items.map((item) => (
                <div key={item.id} className="flex items-center justify-between px-6 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{item.name}</p>
                    <p className="text-xs text-gray-400">{item.category} · {item.unit}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">₹{item.price}</p>
                    <p className={`text-xs ${item.stockQty === 0 ? 'text-red-500' : 'text-gray-400'}`}>
                      {item.stockQty === 0 ? 'Out of stock' : `Stock: ${item.stockQty}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent orders */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Recent Orders</h2>
        </div>
        {recentOrders.length === 0 ? (
          <p className="px-6 py-10 text-sm text-gray-400 text-center">No orders yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-6 py-3 text-left font-medium text-gray-500">Order ID</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Customer</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Items</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Total</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Status</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {recentOrders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50/50">
                  <td className="px-6 py-3 font-mono text-xs text-gray-600">
                    #{order.id.slice(-8).toUpperCase()}
                  </td>
                  <td className="px-6 py-3 text-gray-900">{order.customerName}</td>
                  <td className="px-6 py-3 text-gray-500">{order.items.length}</td>
                  <td className="px-6 py-3 font-medium">₹{order.total.toFixed(2)}</td>
                  <td className="px-6 py-3">
                    <StatusBadge status={order.status as OrderStatus} />
                  </td>
                  <td className="px-6 py-3 text-gray-500 text-xs">
                    {new Date(order.createdAt).toLocaleDateString('en-IN')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
