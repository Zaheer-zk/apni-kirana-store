'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  Eye,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import DataTable, { Column } from '@/components/DataTable';

// ─── Types ────────────────────────────────────────────────────────────────────

type NotificationChannel = 'INAPP' | 'PUSH' | 'WEBPUSH' | 'SOCKET' | 'EMAIL' | 'SMS';
type NotificationStatus = 'PENDING' | 'DELIVERED' | 'FAILED';

interface NotificationLogRow {
  id: string;
  userId: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  isRead: boolean;
  createdAt: string;
  event: string | null;
  channel: NotificationChannel;
  status: NotificationStatus;
  error: string | null;
  recipient: {
    id: string;
    name: string | null;
    phone: string | null;
    email: string | null;
    role: string;
  } | null;
}

interface NotificationsLogResponse {
  logs: NotificationLogRow[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Mirrors backend/src/services/notification.service.ts NotificationEvent union.
const EVENT_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All events' },
  { value: 'ORDER_PLACED', label: 'Order placed' },
  { value: 'ORDER_ACCEPTED', label: 'Order accepted' },
  { value: 'ORDER_REJECTED', label: 'Order rejected' },
  { value: 'ORDER_DRIVER_ASSIGNED', label: 'Order: driver assigned' },
  { value: 'ORDER_PICKED_UP', label: 'Order picked up' },
  { value: 'ORDER_DELIVERED', label: 'Order delivered' },
  { value: 'ORDER_CANCELLED', label: 'Order cancelled' },
  { value: 'STORE_NEW_ORDER', label: 'Store: new order' },
  { value: 'STORE_ORDER_OFFERED', label: 'Store: order offered' },
  { value: 'STORE_ORDER_RESCINDED', label: 'Store: order rescinded' },
  { value: 'STORE_APPROVED', label: 'Store approved' },
  { value: 'STORE_SUSPENDED', label: 'Store suspended' },
  { value: 'DRIVER_NEW_DELIVERY', label: 'Driver: new delivery' },
  { value: 'DRIVER_OFFER_RESCINDED', label: 'Driver: offer rescinded' },
  { value: 'DRIVER_APPROVED', label: 'Driver approved' },
  { value: 'DRIVER_SUSPENDED', label: 'Driver suspended' },
  { value: 'DRIVER_PAYOUT', label: 'Driver payout' },
  { value: 'ADMIN_NEW_STORE_PENDING', label: 'Admin: new store pending' },
  { value: 'ADMIN_NEW_DRIVER_PENDING', label: 'Admin: new driver pending' },
  { value: 'ADMIN_ORDER_PLACED', label: 'Admin: order placed' },
  { value: 'PROMO_ANNOUNCE', label: 'Promo announce' },
  { value: 'CHAT_MESSAGE', label: 'Chat message' },
  { value: 'SUPPORT_REPLY', label: 'Support reply' },
  { value: 'ADMIN_SUPPORT_NEW', label: 'Admin: new support message' },
];

const CHANNEL_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All channels' },
  { value: 'INAPP', label: 'In-app' },
  { value: 'PUSH', label: 'Mobile push' },
  { value: 'WEBPUSH', label: 'Web push' },
  { value: 'SOCKET', label: 'Socket' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'SMS', label: 'SMS' },
];

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'PENDING', label: 'Pending' },
];

const STATUS_BADGE: Record<NotificationStatus, string> = {
  DELIVERED: 'bg-green-50 text-green-700 border-green-200',
  FAILED: 'bg-red-50 text-red-700 border-red-200',
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
};

const CHANNEL_BADGE: Record<NotificationChannel, string> = {
  INAPP: 'bg-gray-100 text-gray-700 border-gray-200',
  PUSH: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  WEBPUSH: 'bg-sky-50 text-sky-700 border-sky-200',
  SOCKET: 'bg-violet-50 text-violet-700 border-violet-200',
  EMAIL: 'bg-amber-50 text-amber-700 border-amber-200',
  SMS: 'bg-orange-50 text-orange-700 border-orange-200',
};

const ROLE_BADGE: Record<string, string> = {
  CUSTOMER: 'bg-blue-50 text-blue-700 border-blue-200',
  STORE_OWNER: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  DRIVER: 'bg-purple-50 text-purple-700 border-purple-200',
  ADMIN: 'bg-rose-50 text-rose-700 border-rose-200',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelative(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diffMs = Date.now() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min${diffMin === 1 ? '' : 's'} ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr${diffHr === 1 ? '' : 's'} ago`;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function truncate(s: string | null | undefined, n: number): string {
  if (!s) return '';
  return s.length <= n ? s : `${s.slice(0, n)}…`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NotificationsLogPage() {
  const [recipientSearch, setRecipientSearch] = useState('');
  const [event, setEvent] = useState('');
  const [channel, setChannel] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  // The recipient search field accepts a userId directly (or empty). For
  // name/phone search we'd need a User lookup step; keep this simple for now.
  const [userIdFilter, setUserIdFilter] = useState('');

  const [page, setPage] = useState(1);
  const limit = 25;

  const [autoRefresh, setAutoRefresh] = useState(true);

  const [detailRow, setDetailRow] = useState<NotificationLogRow | null>(null);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [userIdFilter, event, channel, status, from, to]);

  const queryKey = [
    'admin-notifications-log',
    { userIdFilter, event, channel, status, from, to, page, limit },
  ] as const;

  const { data, isLoading, isError, refetch, isFetching } =
    useQuery<NotificationsLogResponse>({
      queryKey,
      queryFn: async () => {
        const params = new URLSearchParams();
        if (userIdFilter) params.set('userId', userIdFilter);
        if (event) params.set('event', event);
        if (channel) params.set('channel', channel);
        if (status) params.set('status', status);
        if (from) params.set('from', from);
        if (to) params.set('to', to);
        params.set('page', String(page));
        params.set('limit', String(limit));
        const res = await api.get<{ success: boolean; data: NotificationsLogResponse }>(
          `/api/v1/admin/notifications-log?${params.toString()}`,
        );
        return res.data.data;
      },
      placeholderData: keepPreviousData,
      refetchInterval: autoRefresh ? 30_000 : false,
    });

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.pages ?? 1;

  function applyRecipientSearch() {
    // Treat the search as a userId. (Future: hook into /users?search to map
    // a name/phone to id and then filter.)
    setUserIdFilter(recipientSearch.trim());
  }

  const columns: Column<NotificationLogRow>[] = useMemo(
    () => [
      {
        key: 'createdAt',
        header: 'Time',
        render: (r) => (
          <div className="flex flex-col">
            <span className="text-sm text-gray-900">{formatRelative(r.createdAt)}</span>
            <span className="text-[10px] text-gray-400">
              {new Date(r.createdAt).toLocaleString('en-IN')}
            </span>
          </div>
        ),
      },
      {
        key: 'recipient',
        header: 'Recipient',
        render: (r) => {
          if (!r.recipient) {
            return (
              <div className="flex flex-col">
                <span className="text-sm text-gray-500">(deleted user)</span>
                <span className="font-mono text-[10px] text-gray-400">{r.userId}</span>
              </div>
            );
          }
          const role = r.recipient.role;
          const cls = ROLE_BADGE[role] ?? 'bg-gray-100 text-gray-600 border-gray-200';
          return (
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-gray-900">
                {r.recipient.name ?? '(no name)'}
              </span>
              <span className="text-[11px] text-gray-500">
                {r.recipient.phone ?? r.recipient.email ?? '—'}
              </span>
              <span
                className={`mt-0.5 inline-flex w-fit items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${cls}`}
              >
                {role}
              </span>
            </div>
          );
        },
      },
      {
        key: 'event',
        header: 'Event',
        render: (r) =>
          r.event ? (
            <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-gray-700">
              {r.event}
            </span>
          ) : (
            <span className="text-xs text-gray-400">(ad-hoc)</span>
          ),
      },
      {
        key: 'channel',
        header: 'Channel',
        render: (r) => (
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${CHANNEL_BADGE[r.channel]}`}
          >
            {r.channel}
          </span>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        render: (r) => (
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STATUS_BADGE[r.status]}`}
          >
            {r.status}
          </span>
        ),
      },
      {
        key: 'body',
        header: 'Preview',
        render: (r) => (
          <div className="max-w-md">
            <p className="text-sm font-medium text-gray-900">{truncate(r.title, 60)}</p>
            <p className="text-xs text-gray-500">{truncate(r.body, 90)}</p>
            {r.status === 'FAILED' && r.error && (
              <p className="mt-0.5 text-[11px] font-medium text-red-600">
                {truncate(r.error, 80)}
              </p>
            )}
          </div>
        ),
      },
      {
        key: 'actions',
        header: '',
        render: (r) => (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDetailRow(r);
            }}
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <Eye className="h-3.5 w-3.5" />
            Details
          </button>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <Bell className="h-6 w-6 text-primary" />
            Notifications log
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Every push / in-app / web-push dispatch
            {!isLoading && ` • ${total.toLocaleString('en-IN')} attempts`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            Auto-refresh 30s
          </label>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`}
            />
            Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card space-y-3 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              Recipient (user ID)
            </label>
            <div className="flex gap-1">
              <input
                value={recipientSearch}
                onChange={(e) => setRecipientSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') applyRecipientSearch();
                }}
                placeholder="user id…"
                className="input flex-1 font-mono text-xs"
              />
              <button
                onClick={applyRecipientSearch}
                className="rounded-md border border-gray-200 bg-white px-2 text-gray-600 hover:bg-gray-50"
                aria-label="Apply filter"
              >
                <Search className="h-4 w-4" />
              </button>
            </div>
            {userIdFilter && (
              <button
                onClick={() => {
                  setRecipientSearch('');
                  setUserIdFilter('');
                }}
                className="mt-1 text-[10px] text-primary hover:underline"
              >
                Clear: {truncate(userIdFilter, 16)}
              </button>
            )}
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              Event
            </label>
            <select
              value={event}
              onChange={(e) => setEvent(e.target.value)}
              className="input w-full"
            >
              {EVENT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              Channel
            </label>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="input w-full"
            >
              {CHANNEL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="input w-full"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              From
            </label>
            <input
              type="datetime-local"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="input w-full"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              To
            </label>
            <input
              type="datetime-local"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="input w-full"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <DataTable
          columns={columns}
          rows={logs}
          isLoading={isLoading}
          isError={isError}
          emptyMessage="No dispatch attempts match these filters."
          onRowClick={(r) => setDetailRow(r)}
        />

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 bg-gray-50 px-4 py-3 text-sm sm:px-6">
            <span className="text-gray-500">
              Page {page} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || isLoading}
                className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || isLoading}
                className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail modal */}
      {detailRow && (
        <div className="fixed inset-0 z-50 flex items-stretch justify-center overflow-y-auto bg-gray-900/50 sm:items-center sm:p-4">
          <div className="card flex w-full max-w-3xl flex-col rounded-none p-4 sm:rounded-lg sm:p-6">
            <div className="mb-4 flex items-start justify-between">
              <div className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-primary" />
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    Dispatch attempt
                  </h2>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${CHANNEL_BADGE[detailRow.channel]}`}
                    >
                      {detailRow.channel}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STATUS_BADGE[detailRow.status]}`}
                    >
                      {detailRow.status}
                    </span>
                    <span>•</span>
                    <span>
                      {new Date(detailRow.createdAt).toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setDetailRow(null)}
                className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-4 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
              <div className="rounded-md bg-gray-50 px-3 py-2">
                <p className="font-semibold uppercase tracking-wider text-gray-400">
                  Recipient
                </p>
                <p className="text-gray-800">
                  {detailRow.recipient?.name ?? '(unknown user)'}
                </p>
                <p className="text-[11px] text-gray-500">
                  {detailRow.recipient?.phone ?? detailRow.recipient?.email ?? '—'}
                </p>
                <p className="font-mono text-[10px] text-gray-400">
                  {detailRow.userId}
                </p>
              </div>
              <div className="rounded-md bg-gray-50 px-3 py-2">
                <p className="font-semibold uppercase tracking-wider text-gray-400">
                  Event
                </p>
                <p className="font-mono text-gray-800">
                  {detailRow.event ?? '(ad-hoc)'}
                </p>
              </div>
            </div>

            <div className="mb-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Title
              </p>
              <p className="text-sm text-gray-900">{detailRow.title}</p>
              <p className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Body
              </p>
              <p className="whitespace-pre-wrap text-sm text-gray-900">
                {detailRow.body}
              </p>
            </div>

            {detailRow.status === 'FAILED' && detailRow.error && (
              <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-red-600">
                  Delivery error
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-red-700">
                  {detailRow.error}
                </p>
              </div>
            )}

            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Payload (data)
              </p>
              <pre className="max-h-72 overflow-auto rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-800">
                {detailRow.data == null
                  ? '—'
                  : JSON.stringify(detailRow.data, null, 2)}
              </pre>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setDetailRow(null)}
                className="btn-secondary"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
