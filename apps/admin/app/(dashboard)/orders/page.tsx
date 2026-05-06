'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Filter } from 'lucide-react';
import { api } from '@/lib/api';
import StatusBadge from '@/components/StatusBadge';
import DataTable, { Column } from '@/components/DataTable';
import { OrderStatus } from '@aks/shared';

interface OrderRow {
  id: string;
  status: string;
  total: number;
  paymentMethod: string;
  paymentStatus: string;
  createdAt: string;
  customerName: string;
  storeName: string;
  driverName: string | null;
  itemCount: number;
}

interface OrdersResponse {
  orders: Array<{
    id: string;
    status: string;
    total: number;
    paymentMethod: string;
    paymentStatus: string;
    createdAt: string;
    customer?: { name: string | null; phone: string };
    store?: { name: string };
    driver?: { user?: { name: string | null } } | null;
    items?: unknown[];
    _count?: { items?: number };
  }>;
  total: number;
  page: number;
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All Statuses' },
  { value: OrderStatus.PENDING, label: 'Pending' },
  { value: OrderStatus.STORE_ACCEPTED, label: 'Store Accepted' },
  { value: OrderStatus.DRIVER_ASSIGNED, label: 'Driver Assigned' },
  { value: OrderStatus.PICKED_UP, label: 'Picked Up' },
  { value: OrderStatus.DELIVERED, label: 'Delivered' },
  { value: OrderStatus.CANCELLED, label: 'Cancelled' },
  { value: OrderStatus.REJECTED, label: 'Rejected' },
];

export default function OrdersPage() {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (from) params.set('from', from);
  if (to) params.set('to', to);

  const { data, isLoading, isError } = useQuery<OrderRow[]>({
    queryKey: ['admin-orders', status, from, to],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: OrdersResponse }>(
        `/api/v1/admin/orders?${params.toString()}`
      );
      const list = res.data?.data?.orders ?? [];
      return list.map((o) => ({
        id: o.id,
        status: o.status,
        total: o.total,
        paymentMethod: o.paymentMethod,
        paymentStatus: o.paymentStatus,
        createdAt: o.createdAt,
        customerName: o.customer?.name ?? o.customer?.phone ?? '—',
        storeName: o.store?.name ?? '—',
        driverName: o.driver?.user?.name ?? null,
        itemCount: o._count?.items ?? o.items?.length ?? 0,
      }));
    },
  });

  const columns: Column<OrderRow>[] = [
    {
      key: 'id',
      header: 'Order ID',
      render: (o) => (
        <span className="font-mono text-xs text-gray-600">
          #{o.id.slice(-8).toUpperCase()}
        </span>
      ),
    },
    {
      key: 'customerName',
      header: 'Customer',
      render: (o) => (
        <span
          className="block max-w-[160px] truncate text-gray-900 sm:max-w-none"
          title={o.customerName}
        >
          {o.customerName}
        </span>
      ),
    },
    {
      key: 'storeName',
      header: 'Store',
      render: (o) => (
        <span
          className="block max-w-[160px] truncate text-gray-700 sm:max-w-none"
          title={o.storeName}
        >
          {o.storeName}
        </span>
      ),
    },
    {
      key: 'driverName',
      header: 'Driver',
      render: (o) => (
        <span
          className="block max-w-[160px] truncate text-gray-500 sm:max-w-none"
          title={o.driverName ?? ''}
        >
          {o.driverName ?? '—'}
        </span>
      ),
    },
    {
      key: 'items',
      header: 'Items',
      render: (o) => (
        <span className="text-gray-700">{o.itemCount}</span>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      render: (o) => (
        <span className="font-medium text-gray-900">₹{o.total.toFixed(2)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (o) => <StatusBadge status={o.status} />,
    },
    {
      key: 'createdAt',
      header: 'Placed At',
      render: (o) => (
        <span className="text-xs text-gray-400">
          {new Date(o.createdAt).toLocaleString('en-IN', {
            dateStyle: 'short',
            timeStyle: 'short',
          })}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
        <p className="mt-1 text-sm text-gray-500">All orders across the platform</p>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-600">
            <Filter className="h-4 w-4" />
            Filters
          </div>

          {/* Status */}
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="input w-full sm:w-48"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* Date range */}
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="input w-full sm:w-40"
              placeholder="From"
            />
            <span className="text-gray-400 text-sm">to</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="input w-full sm:w-40"
              placeholder="To"
            />
          </div>

          {(status || from || to) && (
            <button
              onClick={() => { setStatus(''); setFrom(''); setTo(''); }}
              className="text-sm text-gray-400 hover:text-gray-700 underline"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <DataTable
          columns={columns}
          rows={data ?? []}
          isLoading={isLoading}
          isError={isError}
          emptyMessage="No orders match the selected filters."
          onRowClick={(o) => router.push(`/orders/${o.id}`)}
        />
      </div>
    </div>
  );
}
