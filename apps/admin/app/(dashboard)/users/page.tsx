'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  ShieldOff,
  ShieldCheck,
  Loader2,
  ChevronLeft,
  ChevronRight,
  UserPlus,
  Pencil,
  KeyRound,
  Crown,
} from 'lucide-react';
import { api } from '@/lib/api';
import { isSuperAdmin } from '@/lib/auth';
import type { ApiResponse } from '@aks/shared';
import UserFormModal, { type ManagedUser } from '@/components/UserFormModal';

const ROLE_OPTIONS = [
  { value: '', label: 'All Roles' },
  { value: 'CUSTOMER', label: 'Customer' },
  { value: 'STORE_OWNER', label: 'Store Owner' },
  { value: 'DRIVER', label: 'Driver' },
  { value: 'ADMIN', label: 'Admin' },
];

const ROLE_BADGE: Record<string, string> = {
  CUSTOMER: 'bg-blue-50 text-blue-700',
  STORE_OWNER: 'bg-purple-50 text-purple-700',
  DRIVER: 'bg-amber-50 text-amber-700',
  ADMIN: 'bg-red-50 text-red-700',
};

interface UserRow extends ManagedUser {
  createdAt: string;
}

const PAGE_SIZE = 20;

export default function UsersPage() {
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; user?: ManagedUser } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Read once on the client — gates Edit on admin rows. Backend enforces too.
  const [superAdmin, setSuperAdmin] = useState(false);
  useEffect(() => setSuperAdmin(isSuperAdmin()), []);
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery<{ users: UserRow[]; total: number; pages: number }>({
    queryKey: ['admin-users', search, role, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: page.toString(), limit: PAGE_SIZE.toString() });
      if (search) params.set('search', search);
      if (role) params.set('role', role);
      const res = await api.get<
        ApiResponse<{ users: UserRow[]; total: number; pages: number }>
      >(`/api/v1/admin/users?${params.toString()}`);
      const payload = res.data?.data ?? { users: [], total: 0, pages: 0 };
      return {
        users: Array.isArray(payload.users) ? payload.users : [],
        total: payload.total ?? 0,
        pages: payload.pages ?? 0,
      };
    },
  });

  const suspendMutation = useMutation({
    mutationFn: (userId: string) => api.put(`/api/v1/admin/users/${userId}/suspend`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  });

  const resetMutation = useMutation({
    mutationFn: (userId: string) =>
      api.post<ApiResponse<null>>(`/api/v1/admin/users/${userId}/reset-credentials`),
    onSuccess: (res) => {
      setNotice(res.data?.message ?? 'A password-reset link has been emailed to the user.');
      setTimeout(() => setNotice(null), 6000);
    },
    onError: (err: unknown) => {
      setNotice(
        (err as { response?: { data?: ApiResponse<unknown> } })?.response?.data?.error ??
          'Could not send the reset link.',
      );
      setTimeout(() => setNotice(null), 6000);
    },
  });

  const users = data?.users ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="mt-1 text-sm text-gray-500">
            Create, edit and manage every account on the platform
          </p>
        </div>
        <button onClick={() => setModal({ mode: 'create' })} className="btn-primary">
          <UserPlus className="mr-1.5 h-4 w-4" />
          Add user
        </button>
      </div>

      {notice && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          {notice}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search name, phone, email or username…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="input pl-9"
          />
        </div>
        <select
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
            setPage(1);
          }}
          className="input w-40"
        >
          {ROLE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <p className="text-sm text-gray-400">
          {total.toLocaleString('en-IN')} user{total !== 1 ? 's' : ''} found
        </p>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 text-left font-medium text-gray-500 sm:px-6">Name</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500 sm:px-6">Contact</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500 sm:px-6">Roles</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500 sm:px-6">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500 sm:px-6">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="bg-white">
                    {Array.from({ length: 5 }).map((__, j) => (
                      <td key={j} className="px-4 py-3 sm:px-6">
                        <div className="h-4 animate-pulse rounded bg-gray-100" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : isError ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-red-500">
                    Failed to load users.
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-400">
                    No users found.
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="bg-white transition-colors hover:bg-gray-50/50">
                    <td className="px-4 py-3 sm:px-6">
                      <div className="font-medium text-gray-900">{user.name ?? '—'}</div>
                      {user.username && (
                        <div className="text-xs text-gray-400">@{user.username}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 sm:px-6">
                      <div className="font-mono text-xs text-gray-600">{user.phone}</div>
                      {user.email && (
                        <div className="max-w-[200px] truncate text-xs text-gray-400" title={user.email}>
                          {user.email}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 sm:px-6">
                      <div className="flex flex-wrap gap-1">
                        {user.isSuperAdmin && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                            <Crown className="h-3 w-3" />
                            Super Admin
                          </span>
                        )}
                        {(user.roles?.length ? user.roles : [user.role]).map((r) => (
                          <span
                            key={r}
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                              ROLE_BADGE[r] ?? 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {r.replace('_', ' ')}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 sm:px-6">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          user.isActive ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
                        }`}
                      >
                        {user.isActive ? 'Active' : 'Suspended'}
                      </span>
                    </td>
                    <td className="px-4 py-3 sm:px-6">
                      <div className="flex items-center gap-1.5">
                        {(user.role !== 'ADMIN' || superAdmin) && (
                          <button
                            onClick={() => setModal({ mode: 'edit', user })}
                            className="inline-flex min-h-[32px] items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </button>
                        )}
                        <button
                          onClick={() => resetMutation.mutate(user.id)}
                          disabled={resetMutation.isPending}
                          title="Email a password-reset link"
                          className="inline-flex min-h-[32px] items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                          Reset
                        </button>
                        <button
                          onClick={() => suspendMutation.mutate(user.id)}
                          disabled={suspendMutation.isPending}
                          className={`inline-flex min-h-[32px] items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium disabled:opacity-50 ${
                            user.isActive
                              ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                              : 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100'
                          }`}
                        >
                          {user.isActive ? (
                            <ShieldOff className="h-3.5 w-3.5" />
                          ) : (
                            <ShieldCheck className="h-3.5 w-3.5" />
                          )}
                          {user.isActive ? 'Suspend' : 'Unsuspend'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-4 py-4 sm:px-6">
            <p className="text-sm text-gray-500">
              Page {page} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-secondary px-2.5 py-1.5 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="btn-secondary px-2.5 py-1.5 disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {modal && (
        <UserFormModal mode={modal.mode} user={modal.user} onClose={() => setModal(null)} />
      )}
    </div>
  );
}
