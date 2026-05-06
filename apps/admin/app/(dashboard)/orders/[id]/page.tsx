'use client';

import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, User, Store, Bike, MapPin, Clock, Package } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import StatusBadge from '@/components/StatusBadge';
import type { Order, OrderItem } from '@aks/shared';
import { OrderStatus } from '@aks/shared';

interface StatusEvent {
  status: OrderStatus;
  timestamp: string;
  note?: string;
}

interface OrderDetail extends Order {
  customerName: string;
  customerPhone: string;
  storeName: string;
  storeAddress: string;
  storeLat: number;
  storeLng: number;
  driverName: string | null;
  driverPhone: string | null;
  driverVehicle: string | null;
  timeline: StatusEvent[];
}

function SectionCard({ title, icon, children }: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="text-primary">{icon}</div>
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-900 text-right max-w-xs">{value}</span>
    </div>
  );
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  [OrderStatus.PENDING]: 'Pending',
  [OrderStatus.STORE_ACCEPTED]: 'Accepted by Store',
  [OrderStatus.DRIVER_ASSIGNED]: 'Driver Assigned',
  [OrderStatus.PICKED_UP]: 'Picked Up',
  [OrderStatus.DELIVERED]: 'Delivered',
  [OrderStatus.CANCELLED]: 'Cancelled',
  [OrderStatus.REJECTED]: 'Rejected',
};

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const { data, isLoading, isError } = useQuery<OrderDetail>({
    queryKey: ['admin-order', id],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: OrderDetail }>(
        `/api/v1/admin/orders/${id}`
      );
      return res.data.data!;
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-60 rounded bg-gray-200" />
        <div className="grid grid-cols-2 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card h-40" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="py-20 text-center">
        <p className="text-red-500">Failed to load order details.</p>
        <Link href="/orders" className="mt-4 inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to Orders
        </Link>
      </div>
    );
  }

  const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${data.storeLat},${data.storeLng}&destination=${data.deliveryAddress.lat},${data.deliveryAddress.lng}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link href="/orders" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
          <ArrowLeft className="h-4 w-4" /> Back to Orders
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Order #{data.id.slice(-8).toUpperCase()}
            </h1>
            <p className="mt-1 text-sm text-gray-400">
              Placed on{' '}
              {new Date(data.createdAt).toLocaleString('en-IN', {
                dateStyle: 'long',
                timeStyle: 'short',
              })}
            </p>
          </div>
          <StatusBadge status={data.status} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Customer */}
        <SectionCard title="Customer" icon={<User className="h-4 w-4" />}>
          <div className="space-y-2">
            <InfoLine label="Name" value={data.customerName} />
            <InfoLine label="Phone" value={data.customerPhone} />
            <InfoLine label="Delivery Address" value={`${data.deliveryAddress.street}, ${data.deliveryAddress.city}`} />
          </div>
        </SectionCard>

        {/* Store */}
        <SectionCard title="Store" icon={<Store className="h-4 w-4" />}>
          <div className="space-y-2">
            <InfoLine label="Store" value={data.storeName} />
            <InfoLine label="Address" value={data.storeAddress} />
          </div>
        </SectionCard>

        {/* Driver */}
        <SectionCard title="Driver" icon={<Bike className="h-4 w-4" />}>
          {data.driverName ? (
            <div className="space-y-2">
              <InfoLine label="Name" value={data.driverName} />
              <InfoLine label="Phone" value={data.driverPhone ?? '—'} />
              <InfoLine label="Vehicle" value={data.driverVehicle ?? '—'} />
            </div>
          ) : (
            <p className="text-sm text-gray-400">No driver assigned yet.</p>
          )}
        </SectionCard>

        {/* Map link */}
        <SectionCard title="Route" icon={<MapPin className="h-4 w-4" />}>
          <p className="text-sm text-gray-500 mb-3">
            Store → Delivery Address
          </p>
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary text-sm"
          >
            Open in Google Maps
          </a>
          <div className="mt-3 space-y-1 text-xs text-gray-400">
            <p>Store: {data.storeLat.toFixed(5)}, {data.storeLng.toFixed(5)}</p>
            <p>Drop: {data.deliveryAddress.lat.toFixed(5)}, {data.deliveryAddress.lng.toFixed(5)}</p>
          </div>
        </SectionCard>
      </div>

      {/* Items */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
          <Package className="h-4 w-4 text-primary" />
          <h3 className="text-base font-semibold text-gray-900">Items ({data.items.length})</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-6 py-3 text-left font-medium text-gray-500">Item</th>
              <th className="px-6 py-3 text-left font-medium text-gray-500">Unit</th>
              <th className="px-6 py-3 text-right font-medium text-gray-500">Qty</th>
              <th className="px-6 py-3 text-right font-medium text-gray-500">Price</th>
              <th className="px-6 py-3 text-right font-medium text-gray-500">Subtotal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {data.items.map((item: OrderItem) => (
              <tr key={item.itemId}>
                <td className="px-6 py-3 font-medium text-gray-900">{item.name}</td>
                <td className="px-6 py-3 text-gray-500">{item.unit}</td>
                <td className="px-6 py-3 text-right text-gray-700">{item.qty}</td>
                <td className="px-6 py-3 text-right text-gray-700">₹{item.price}</td>
                <td className="px-6 py-3 text-right font-medium text-gray-900">
                  ₹{(item.price * item.qty).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-100 bg-gray-50">
              <td colSpan={4} className="px-6 py-3 text-right text-sm text-gray-500">Subtotal</td>
              <td className="px-6 py-3 text-right font-medium text-gray-900">₹{data.subtotal.toFixed(2)}</td>
            </tr>
            <tr>
              <td colSpan={4} className="px-6 py-3 text-right text-sm text-gray-500">Delivery Fee</td>
              <td className="px-6 py-3 text-right font-medium text-gray-900">₹{data.deliveryFee.toFixed(2)}</td>
            </tr>
            <tr className="border-t border-gray-200">
              <td colSpan={4} className="px-6 py-3 text-right text-sm font-semibold text-gray-900">Total</td>
              <td className="px-6 py-3 text-right text-base font-bold text-primary">
                ₹{data.total.toFixed(2)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Timeline */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-5">
          <Clock className="h-4 w-4 text-primary" />
          <h3 className="text-base font-semibold text-gray-900">Status Timeline</h3>
        </div>
        <ol className="relative border-l border-gray-200 space-y-5 pl-5">
          {data.timeline.map((event, i) => (
            <li key={i} className="relative">
              <div className="absolute -left-[21px] top-0.5 h-3 w-3 rounded-full bg-primary border-2 border-white" />
              <div className="flex items-baseline justify-between">
                <p className="text-sm font-medium text-gray-900">
                  {STATUS_LABELS[event.status] ?? event.status}
                </p>
                <time className="text-xs text-gray-400">
                  {new Date(event.timestamp).toLocaleString('en-IN', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </time>
              </div>
              {event.note && (
                <p className="mt-0.5 text-xs text-gray-400">{event.note}</p>
              )}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
