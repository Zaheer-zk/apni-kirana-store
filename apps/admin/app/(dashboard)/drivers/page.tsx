'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, CheckCircle, XCircle, PauseCircle, Loader2, Star } from 'lucide-react';
import { api } from '@/lib/api';
import StatusBadge from '@/components/StatusBadge';
import DataTable, { Column } from '@/components/DataTable';
import type { DriverProfile } from '@aks/shared';
import { DriverStatus } from '@aks/shared';

type TabKey = 'PENDING_APPROVAL' | 'ACTIVE' | 'SUSPENDED';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'PENDING_APPROVAL', label: 'Pending Approval' },
  { key: 'ACTIVE', label: 'Active' },
  { key: 'SUSPENDED', label: 'Suspended' },
];

interface DriverRow extends DriverProfile {
  totalDeliveries: number;
  createdAt: string;
}

export default function DriversPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('PENDING_APPROVAL');
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery<DriverRow[]>({
    queryKey: ['admin-drivers', activeTab],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: DriverRow[] }>(
        `/api/v1/admin/drivers?status=${activeTab}`
      );
      return res.data.data ?? [];
    },
  });

  const mutation = useMutation({
    mutationFn: ({ driverId, action }: { driverId: string; action: string }) =>
      api.patch(`/api/v1/admin/drivers/${driverId}/status`, { action }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-drivers'] });
    },
  });

  const filtered = (data ?? []).filter((d) => {
    const q = search.toLowerCase();
    return d.name.toLowerCase().includes(q) || d.phone.includes(q);
  });

  const columns: Column<DriverRow>[] = [
    {
      key: 'name',
      header: 'Driver',
      render: (d) => (
        <div>
          <p className="font-medium text-gray-900">{d.name}</p>
          <p className="text-xs text-gray-400">{d.phone}</p>
        </div>
      ),
    },
    {
      key: 'vehicleType',
      header: 'Vehicle',
      render: (d) => (
        <div>
          <p className="text-gray-900">{d.vehicleType}</p>
          <p className="text-xs text-gray-400 font-mono">{d.vehicleNumber}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (d) => <StatusBadge status={d.status as DriverStatus} />,
    },
    {
      key: 'rating',
      header: 'Rating',
      render: (d) => (
        <div className="flex items-center gap-1">
          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
          <span className="text-sm text-gray-700">{d.rating.toFixed(1)}</span>
        </div>
      ),
    },
    {
      key: 'totalDeliveries',
      header: 'Deliveries',
      render: (d) => (
        <span className="text-sm text-gray-700">{d.totalDeliveries.toLocaleString('en-IN')}</span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Joined',
      render: (d) => (
        <span className="text-xs text-gray-400">
          {new Date(d.createdAt).toLocaleDateString('en-IN')}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (d) => (
        <div className="flex items-center gap-2">
          {activeTab === 'PENDING_APPROVAL' && (
            <>
              <ActionButton
                label="Approve"
                icon={<CheckCircle className="h-3.5 w-3.5" />}
                variant="success"
                loading={mutation.isPending}
                onClick={() => mutation.mutate({ driverId: d.id, action: 'approve' })}
              />
              <ActionButton
                label="Reject"
                icon={<XCircle className="h-3.5 w-3.5" />}
                variant="danger"
                loading={mutation.isPending}
                onClick={() => mutation.mutate({ driverId: d.id, action: 'reject' })}
              />
            </>
          )}
          {activeTab === 'ACTIVE' && (
            <ActionButton
              label="Suspend"
              icon={<PauseCircle className="h-3.5 w-3.5" />}
              variant="warning"
              loading={mutation.isPending}
              onClick={() => mutation.mutate({ driverId: d.id, action: 'suspend' })}
            />
          )}
          {activeTab === 'SUSPENDED' && (
            <ActionButton
              label="Reinstate"
              icon={<CheckCircle className="h-3.5 w-3.5" />}
              variant="success"
              loading={mutation.isPending}
              onClick={() => mutation.mutate({ driverId: d.id, action: 'reinstate' })}
            />
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Drivers</h1>
        <p className="mt-1 text-sm text-gray-500">Review and manage delivery driver accounts</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search by name or phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input pl-9"
        />
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <DataTable
          columns={columns}
          rows={filtered}
          isLoading={isLoading}
          isError={isError}
          emptyMessage="No drivers in this category."
        />
      </div>
    </div>
  );
}

interface ActionButtonProps {
  label: string;
  icon: React.ReactNode;
  variant: 'success' | 'danger' | 'warning';
  loading: boolean;
  onClick: () => void;
}

const variantClasses: Record<ActionButtonProps['variant'], string> = {
  success: 'bg-green-50 text-green-700 hover:bg-green-100 border-green-200',
  danger: 'bg-red-50 text-red-700 hover:bg-red-100 border-red-200',
  warning: 'bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-200',
};

function ActionButton({ label, icon, variant, loading, onClick }: ActionButtonProps) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={loading}
      className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${variantClasses[variant]}`}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
      {label}
    </button>
  );
}
