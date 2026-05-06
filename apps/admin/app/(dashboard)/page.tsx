'use client';

import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { ShoppingCart, IndianRupee, Bike, Store } from 'lucide-react';
import { api } from '@/lib/api';
import StatCard from '@/components/StatCard';
import StatusBadge from '@/components/StatusBadge';
import type { Order } from '@aks/shared';
import { OrderStatus } from '@aks/shared';

interface AnalyticsData {
  ordersToday: number;
  gmvToday: number;
  activeDrivers: number;
  activeStores: number;
  ordersPerDay: { date: string; orders: number }[];
  recentOrders: (Order & { customerName: string; storeName: string })[];
}

function SkeletonCard() {
  return (
    <div className="card p-6 animate-pulse">
      <div className="h-4 w-24 rounded bg-gray-200 mb-3" />
      <div className="h-8 w-32 rounded bg-gray-200" />
    </div>
  );
}

function SkeletonRow() {
  return (
    <tr>
      {Array.from({ length: 6 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 rounded bg-gray-100 animate-pulse" />
        </td>
      ))}
    </tr>
  );
}

export default function DashboardPage() {
  const { data, isLoading, isError } = useQuery<AnalyticsData>({
    queryKey: ['admin-analytics'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: AnalyticsData }>(
        '/api/v1/admin/analytics'
      );
      return res.data.data!;
    },
  });

  return (
    <div className="space-y-8">
      {/* Page heading */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Real-time overview of today&apos;s operations
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <StatCard
              icon={<ShoppingCart className="h-5 w-5 text-primary" />}
              label="Total Orders Today"
              value={data?.ordersToday ?? 0}
            />
            <StatCard
              icon={<IndianRupee className="h-5 w-5 text-primary" />}
              label="GMV Today"
              value={`₹${(data?.gmvToday ?? 0).toLocaleString('en-IN')}`}
            />
            <StatCard
              icon={<Bike className="h-5 w-5 text-primary" />}
              label="Active Drivers"
              value={data?.activeDrivers ?? 0}
            />
            <StatCard
              icon={<Store className="h-5 w-5 text-primary" />}
              label="Active Stores"
              value={data?.activeStores ?? 0}
            />
          </>
        )}
      </div>

      {/* Bar chart */}
      <div className="card p-6">
        <h2 className="mb-5 text-base font-semibold text-gray-900">
          Orders — Last 7 Days
        </h2>
        {isLoading ? (
          <div className="h-56 animate-pulse rounded-lg bg-gray-100" />
        ) : isError ? (
          <p className="py-10 text-center text-sm text-red-500">
            Failed to load chart data.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data?.ordersPerDay ?? []} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12, fill: '#6B7280' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 12, fill: '#6B7280' }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: '1px solid #E5E7EB',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                  fontSize: 13,
                }}
                cursor={{ fill: '#F0FDF4' }}
              />
              <Bar dataKey="orders" fill="#16A34A" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Recent orders table */}
      <div className="card overflow-hidden">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">Recent Orders</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-6 py-3 text-left font-medium text-gray-500">Order ID</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Customer</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Store</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Total</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Status</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
              ) : isError ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-sm text-red-500">
                    Failed to load recent orders.
                  </td>
                </tr>
              ) : !data?.recentOrders?.length ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-400">
                    No orders yet today.
                  </td>
                </tr>
              ) : (
                data.recentOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-3 font-mono text-xs text-gray-600">
                      #{order.id.slice(-8).toUpperCase()}
                    </td>
                    <td className="px-6 py-3 text-gray-900">{order.customerName}</td>
                    <td className="px-6 py-3 text-gray-700">{order.storeName}</td>
                    <td className="px-6 py-3 font-medium text-gray-900">
                      ₹{order.total.toFixed(2)}
                    </td>
                    <td className="px-6 py-3">
                      <StatusBadge status={order.status as OrderStatus} />
                    </td>
                    <td className="px-6 py-3 text-gray-500">
                      {new Date(order.createdAt).toLocaleTimeString('en-IN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
