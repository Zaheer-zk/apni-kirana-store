'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, CheckCircle, XCircle, PauseCircle, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import StatusBadge from '@/components/StatusBadge';
import DataTable, { Column } from '@/components/DataTable';
import { StoreStatus } from '@aks/shared';

type TabKey = 'PENDING_APPROVAL' | 'ACTIVE' | 'SUSPENDED';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'PENDING_APPROVAL', label: 'Pending Approval' },
  { key: 'ACTIVE', label: 'Active' },
  { key: 'SUSPENDED', label: 'Suspended' },
];

interface StoreRow {
  id: string;
  name: string;
  category: string;
  status: string;
  city: string;
  rating: number;
  ownerName: string;
  ownerPhone: string;
  itemCount: number;
  orderCount: number;
  createdAt: string;
}

interface BackendStore {
  id: string;
  name: string;
  category: string;
  status: string;
  city: string;
  rating: number;
  createdAt: string;
  owner: { id: string; name: string | null; phone: string };
  _count?: { items: number; orders: number };
}

interface StoresResponse {
  stores: BackendStore[];
  total: number;
  page: number;
}

export default function StoresPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('PENDING_APPROVAL');
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery<StoreRow[]>({
    queryKey: ['admin-stores', activeTab],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: StoresResponse }>(
        `/api/v1/admin/stores?status=${activeTab}`
      );
      const list = res.data?.data?.stores ?? [];
      return list.map((s) => ({
        id: s.id,
        name: s.name,
        category: s.category,
        status: s.status,
        city: s.city,
        rating: s.rating ?? 0,
        ownerName: s.owner?.name ?? 'Unnamed',
        ownerPhone: s.owner?.phone ?? '',
        itemCount: s._count?.items ?? 0,
        orderCount: s._count?.orders ?? 0,
        createdAt: s.createdAt,
      }));
    },
  });

  const mutation = useMutation({
    mutationFn: ({ storeId, action }: { storeId: string; action: string }) => {
      const path =
        action === 'approve' || action === 'reinstate'
          ? `/api/v1/admin/stores/${storeId}/approve`
          : `/api/v1/admin/stores/${storeId}/suspend`;
      return api.put(path);
    },
    onSuccess: () => {
      // Refetch ALL admin-stores tabs (Pending, Active, Suspended) so the
      // approved/suspended row appears on the destination tab immediately.
      queryClient.invalidateQueries({ queryKey: ['admin-stores'], refetchType: 'all' });
    },
  });

  const filtered = (data ?? []).filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  const columns: Column<StoreRow>[] = [
    {
      key: 'name',
      header: 'Store Name',
      render: (s) => (
        <div className="min-w-0 max-w-[180px] sm:max-w-none">
          <p className="truncate font-medium text-gray-900" title={s.name}>{s.name}</p>
          <p className="truncate text-xs text-gray-400" title={s.category}>{s.category}</p>
        </div>
      ),
    },
    {
      key: 'ownerName',
      header: 'Owner',
      render: (s) => (
        <div className="min-w-0 max-w-[180px] sm:max-w-none">
          <p className="truncate text-gray-900" title={s.ownerName}>{s.ownerName}</p>
          <p className="truncate text-xs text-gray-400" title={s.ownerPhone}>{s.ownerPhone}</p>
        </div>
      ),
    },
    { key: 'city', header: 'City', render: (s) => <span className="text-gray-700">{s.city}</span> },
    {
      key: 'createdAt',
      header: 'Registered',
      render: (s) => (
        <span className="text-gray-500 text-xs">
          {new Date(s.createdAt).toLocaleDateString('en-IN')}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (s) => <StatusBadge status={s.status} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (s) => (
        <div className="flex items-center gap-2">
          {activeTab === 'PENDING_APPROVAL' && (
            <>
              <ActionButton
                label="Approve"
                icon={<CheckCircle className="h-3.5 w-3.5" />}
                variant="success"
                loading={mutation.isPending}
                onClick={() => mutation.mutate({ storeId: s.id, action: 'approve' })}
              />
              <ActionButton
                label="Reject"
                icon={<XCircle className="h-3.5 w-3.5" />}
                variant="danger"
                loading={mutation.isPending}
                onClick={() => mutation.mutate({ storeId: s.id, action: 'reject' })}
              />
            </>
          )}
          {activeTab === 'ACTIVE' && (
            <ActionButton
              label="Suspend"
              icon={<PauseCircle className="h-3.5 w-3.5" />}
              variant="warning"
              loading={mutation.isPending}
              onClick={() => mutation.mutate({ storeId: s.id, action: 'suspend' })}
            />
          )}
          {activeTab === 'SUSPENDED' && (
            <ActionButton
              label="Reinstate"
              icon={<CheckCircle className="h-3.5 w-3.5" />}
              variant="success"
              loading={mutation.isPending}
              onClick={() => mutation.mutate({ storeId: s.id, action: 'reinstate' })}
            />
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Stores</h1>
        <p className="mt-1 text-sm text-gray-500">Manage store registrations and status</p>
      </div>

      {/* Tabs */}
      <div className="-mx-1 flex gap-1 overflow-x-auto border-b border-gray-200 px-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`-mb-px min-h-[44px] whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
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
      <div className="relative w-full max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search by store name…"
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
          emptyMessage="No stores in this category."
          rowHref={(s) => `/stores/${s.id}`}
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
