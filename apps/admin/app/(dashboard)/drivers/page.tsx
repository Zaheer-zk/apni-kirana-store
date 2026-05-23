'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, CheckCircle, XCircle, PauseCircle, Loader2, Star, ChevronLeft, ChevronRight, Pencil } from 'lucide-react';
import { api } from '@/lib/api';
import StatusBadge from '@/components/StatusBadge';
import DataTable, { Column } from '@/components/DataTable';
import DriverEditModal from '@/components/DriverEditModal';
import UserFormModal, { type ManagedUser } from '@/components/UserFormModal';
import { DriverStatus } from '@aks/shared';

type TabKey = 'PENDING_APPROVAL' | 'ACTIVE' | 'SUSPENDED';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'PENDING_APPROVAL', label: 'Pending Approval' },
  { key: 'ACTIVE', label: 'Active' },
  { key: 'SUSPENDED', label: 'Suspended' },
];

interface DriverRow {
  id: string;
  userId: string;
  name: string;
  phone: string;
  email: string | null;
  userIsActive: boolean;
  vehicleType: string;
  vehicleNumber: string;
  licenseNumber: string;
  status: string;
  rating: number;
  totalDeliveries: number;
  createdAt: string;
  currentLat: number | null;
  currentLng: number | null;
}

interface BackendDriver {
  id: string;
  vehicleType: string;
  vehicleNumber: string;
  licenseNumber?: string | null;
  status: string;
  rating: number;
  createdAt: string;
  currentLat?: number | null;
  currentLng?: number | null;
  user: { id: string; name: string | null; phone: string; email?: string | null; isActive?: boolean };
  _count?: { orders: number };
}

interface DriversResponse {
  drivers: BackendDriver[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

interface DriversResult {
  rows: DriverRow[];
  total: number;
  pages: number;
}

const PAGE_SIZE = 20;

export default function DriversPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('PENDING_APPROVAL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editingDriver, setEditingDriver] = useState<DriverRow | null>(null);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const queryClient = useQueryClient();

  // Reset to page 1 when the tab or search changes
  useEffect(() => {
    setPage(1);
  }, [activeTab, search]);

  const { data, isLoading, isError } = useQuery<DriversResult>({
    queryKey: ['admin-drivers', activeTab, page],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: DriversResponse }>(
        `/api/v1/admin/drivers?status=${activeTab}&page=${page}&limit=${PAGE_SIZE}`
      );
      const list = Array.isArray(res.data?.data?.drivers) ? res.data.data.drivers : [];
      return {
        rows: list.map((d) => ({
          id: d.id,
          userId: d.user?.id ?? '',
          name: d.user?.name ?? 'Unnamed',
          phone: d.user?.phone ?? '',
          email: d.user?.email ?? null,
          userIsActive: d.user?.isActive ?? true,
          vehicleType: d.vehicleType,
          vehicleNumber: d.vehicleNumber,
          licenseNumber: d.licenseNumber ?? '',
          status: d.status,
          rating: d.rating ?? 0,
          totalDeliveries: d._count?.orders ?? 0,
          createdAt: d.createdAt,
          currentLat: d.currentLat ?? null,
          currentLng: d.currentLng ?? null,
        })),
        total: res.data?.data?.total ?? 0,
        pages: res.data?.data?.pages ?? 1,
      };
    },
  });

  const mutation = useMutation({
    mutationFn: ({ driverId, action }: { driverId: string; action: string }) => {
      // Backend uses PUT to dedicated endpoints, not PATCH /status
      const path =
        action === 'approve' || action === 'reinstate'
          ? `/api/v1/admin/drivers/${driverId}/approve`
          : `/api/v1/admin/drivers/${driverId}/suspend`;
      return api.put(path);
    },
    onSuccess: () => {
      // Refetch ALL admin-drivers tabs (Pending, Active, Suspended) so the
      // approved/suspended row appears on the destination tab immediately.
      queryClient.invalidateQueries({ queryKey: ['admin-drivers'], refetchType: 'all' });
    },
  });

  const total = data?.total ?? 0;
  const pages = data?.pages ?? 1;

  const filtered = (data?.rows ?? []).filter((d) => {
    const q = search.toLowerCase();
    return d.name.toLowerCase().includes(q) || d.phone.includes(q);
  });

  const columns: Column<DriverRow>[] = [
    {
      key: 'name',
      header: 'Driver',
      render: (d) => (
        <div className="min-w-0 max-w-[180px] sm:max-w-none">
          <p className="truncate font-medium text-gray-900" title={d.name}>{d.name}</p>
          <p className="truncate text-xs text-gray-400" title={d.phone}>{d.phone}</p>
          {d.email && (
            <p className="truncate text-xs text-gray-400" title={d.email}>{d.email}</p>
          )}
        </div>
      ),
    },
    {
      key: 'vehicleType',
      header: 'Vehicle',
      render: (d) => (
        <div className="min-w-0 max-w-[160px] sm:max-w-none">
          <p className="truncate text-gray-900" title={d.vehicleType}>{d.vehicleType}</p>
          <p className="truncate font-mono text-xs text-gray-400" title={d.vehicleNumber}>{d.vehicleNumber}</p>
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
          <button
            onClick={(e) => {
              e.stopPropagation();
              setEditingDriver(d);
            }}
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setEditingUser({
                id: d.userId,
                name: d.name,
                phone: d.phone,
                email: d.email,
                username: null,
                role: 'DRIVER',
                roles: ['DRIVER'],
                isActive: d.userIsActive,
              });
            }}
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit user
          </button>
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

        {/* Pagination */}
        {!isLoading && !isError && total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-4 py-3 text-sm text-gray-500 sm:px-6">
            <p>
              Page <span className="font-medium text-gray-900">{page}</span> of{' '}
              <span className="font-medium text-gray-900">{pages}</span> •{' '}
              {total.toLocaleString('en-IN')} total
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                disabled={page >= pages}
                className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {editingDriver && (
        <DriverEditModal
          driver={{
            id: editingDriver.id,
            name: editingDriver.name,
            vehicleType: editingDriver.vehicleType,
            vehicleNumber: editingDriver.vehicleNumber,
            licenseNumber: editingDriver.licenseNumber,
            currentLat: editingDriver.currentLat,
            currentLng: editingDriver.currentLng,
          }}
          onClose={() => setEditingDriver(null)}
        />
      )}
      {editingUser && (
        <UserFormModal
          mode="edit"
          user={editingUser}
          onClose={() => {
            setEditingUser(null);
            queryClient.invalidateQueries({ queryKey: ['admin-drivers'], refetchType: 'all' });
          }}
        />
      )}
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
