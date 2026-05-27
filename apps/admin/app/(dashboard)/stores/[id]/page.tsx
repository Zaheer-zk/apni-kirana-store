'use client';

import { use, useState } from 'react';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Star, Package, ShoppingBag, MapPin, Phone, Plus, User, Pencil } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import StatusBadge from '@/components/StatusBadge';
import StoreEditModal from '@/components/StoreEditModal';
import StoreAddItemsModal from '@/components/StoreAddItemsModal';
import type { StoreProfile, InventoryItem, Order } from '@aks/shared';
import { OrderStatus } from '@aks/shared';

// Leaflet uses window/document at module scope — must be client-only
const LocationMap = dynamic(() => import('@/components/LocationMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[240px] items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-500">
      Loading map…
    </div>
  ),
});

interface StoreDetail extends StoreProfile {
  ownerName: string;
  ownerPhone: string;
  description?: string | null;
  street?: string | null;
  city: string;
  state: string;
  pincode: string;
  openTime?: string | null;
  closeTime?: string | null;
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
  const [editing, setEditing] = useState(false);
  const [addingItems, setAddingItems] = useState(false);

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
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{store.name}</h1>
            <p className="mt-1 text-sm text-gray-500">{store.category}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={store.status} />
            <button
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
        {/* Store info */}
        <div className="card space-y-4 p-4 sm:p-6 lg:col-span-1">
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
          <div>
            <p className="mb-1.5 text-xs text-gray-400">Location</p>
            <LocationMap lat={store.lat} lng={store.lng} height={240} />
          </div>
          <div className="pt-2 border-t border-gray-100 text-xs text-gray-400">
            Registered on {new Date(store.createdAt).toLocaleDateString('en-IN', { dateStyle: 'long' })}
          </div>
        </div>

        {/* Items */}
        <div className="card overflow-hidden lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-4 sm:px-6">
            <h2 className="text-base font-semibold text-gray-900">
              Inventory ({items.length} items)
            </h2>
            <button
              type="button"
              onClick={() => setAddingItems(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-primary bg-primary px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-primary-700"
              title="Pre-stock this store with catalog items (admin override)"
            >
              <Plus className="h-3.5 w-3.5" />
              Add items
            </button>
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-10 text-sm text-gray-400 text-center sm:px-6">No items listed yet.</p>
          ) : (
            <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
              {items.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
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
        <div className="px-4 py-4 border-b border-gray-100 sm:px-6">
          <h2 className="text-base font-semibold text-gray-900">Recent Orders</h2>
        </div>
        {recentOrders.length === 0 ? (
          <p className="px-4 py-10 text-sm text-gray-400 text-center sm:px-6">No orders yet.</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
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
          </div>
        )}
      </div>

      {editing && (
        <StoreEditModal
          store={{
            id,
            name: store.name,
            description: store.description,
            category: store.category,
            lat: store.lat,
            lng: store.lng,
            street: store.street,
            city: store.city,
            state: store.state,
            pincode: store.pincode,
            openTime: store.openTime,
            closeTime: store.closeTime,
          }}
          onClose={() => setEditing(false)}
        />
      )}
      {addingItems && (
        <StoreAddItemsModal
          storeId={store.id}
          storeName={store.name}
          onClose={() => setAddingItems(false)}
        />
      )}
    </div>
  );
}
