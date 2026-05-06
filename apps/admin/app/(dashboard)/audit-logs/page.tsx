'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  X,
  History,
} from 'lucide-react';
import { api } from '@/lib/api';
import DataTable, { Column } from '@/components/DataTable';

interface AuditLog {
  id: string;
  actorId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
  createdAt: string;
}

interface AuditLogResponse {
  logs: AuditLog[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

const ACTION_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All actions' },
  { value: 'ORDER_ASSIGN_STORE', label: 'Order: Assign store' },
  { value: 'ORDER_ASSIGN_DRIVER', label: 'Order: Assign driver' },
  { value: 'ORDER_REFUND', label: 'Order: Refund' },
  { value: 'ZONE_CREATE', label: 'Zone: Create' },
  { value: 'ZONE_UPDATE', label: 'Zone: Update' },
  { value: 'ZONE_DELETE', label: 'Zone: Delete' },
];

const TARGET_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All targets' },
  { value: 'ORDER', label: 'Order' },
  { value: 'ZONE', label: 'Zone' },
  { value: 'STORE', label: 'Store' },
  { value: 'DRIVER', label: 'Driver' },
  { value: 'USER', label: 'User' },
  { value: 'PROMO', label: 'Promo' },
];

const ACTION_BADGE_COLORS: Record<string, string> = {
  ORDER_ASSIGN_STORE: 'bg-blue-50 text-blue-700 border-blue-200',
  ORDER_ASSIGN_DRIVER: 'bg-purple-50 text-purple-700 border-purple-200',
  ORDER_REFUND: 'bg-red-50 text-red-700 border-red-200',
  ZONE_CREATE: 'bg-green-50 text-green-700 border-green-200',
  ZONE_UPDATE: 'bg-amber-50 text-amber-700 border-amber-200',
  ZONE_DELETE: 'bg-red-50 text-red-700 border-red-200',
};

function formatRelative(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min${diffMin === 1 ? '' : 's'} ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function truncateId(id: string | null, head = 8): string {
  if (!id) return '—';
  if (id.length <= head) return id;
  return `${id.slice(0, head)}…`;
}

function ActionBadge({ action }: { action: string }) {
  const cls =
    ACTION_BADGE_COLORS[action] ?? 'bg-gray-100 text-gray-600 border-gray-200';
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${cls}`}
    >
      {action}
    </span>
  );
}

export default function AuditLogsPage() {
  const [action, setAction] = useState('');
  const [targetType, setTargetType] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;

  const [diffOpen, setDiffOpen] = useState(false);
  const [diffLog, setDiffLog] = useState<AuditLog | null>(null);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [action, targetType]);

  const queryKey = ['admin-audit-logs', { action, targetType, page, limit }] as const;

  const { data, isLoading, isError } = useQuery<AuditLogResponse>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (action) params.set('action', action);
      if (targetType) params.set('targetType', targetType);
      params.set('page', String(page));
      params.set('limit', String(limit));
      const res = await api.get<{ success: boolean; data: AuditLogResponse }>(
        `/api/v1/admin/audit-logs?${params.toString()}`
      );
      return res.data.data;
    },
    placeholderData: keepPreviousData,
  });

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.pages ?? 1;

  function openDiff(log: AuditLog) {
    setDiffLog(log);
    setDiffOpen(true);
  }

  function closeDiff() {
    setDiffOpen(false);
    setDiffLog(null);
  }

  const columns: Column<AuditLog>[] = useMemo(
    () => [
      {
        key: 'createdAt',
        header: 'Timestamp',
        render: (log) => (
          <div className="flex flex-col">
            <span className="text-sm text-gray-900">
              {formatRelative(log.createdAt)}
            </span>
            <span className="text-[10px] text-gray-400">
              {new Date(log.createdAt).toLocaleString('en-IN')}
            </span>
          </div>
        ),
      },
      {
        key: 'action',
        header: 'Action',
        render: (log) => <ActionBadge action={log.action} />,
      },
      {
        key: 'target',
        header: 'Target',
        render: (log) => (
          <div className="flex flex-col">
            <span className="text-xs font-medium text-gray-700">
              {log.targetType ?? '—'}
            </span>
            <span className="font-mono text-[10px] text-gray-400">
              {truncateId(log.targetId)}
            </span>
          </div>
        ),
      },
      {
        key: 'actor',
        header: 'Actor',
        render: (log) => (
          <span
            className="font-mono text-xs text-gray-600"
            title={log.actorId ?? ''}
          >
            {truncateId(log.actorId)}
          </span>
        ),
      },
      {
        key: 'reason',
        header: 'Reason',
        render: (log) => (
          <p
            className="max-w-xs truncate text-sm text-gray-700"
            title={log.reason ?? ''}
          >
            {log.reason ?? <span className="text-gray-400">—</span>}
          </p>
        ),
      },
      {
        key: 'diff',
        header: 'Before / After',
        render: (log) => {
          const hasDiff =
            (log.before != null && log.before !== undefined) ||
            (log.after != null && log.after !== undefined);
          if (!hasDiff) {
            return <span className="text-xs text-gray-400">—</span>;
          }
          return (
            <button
              onClick={(e) => {
                e.stopPropagation();
                openDiff(log);
              }}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              <Eye className="h-3.5 w-3.5" />
              View diff
            </button>
          );
        },
      },
    ],
    []
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Audit Logs</h1>
        <p className="mt-1 text-sm text-gray-500">
          Trace of every sensitive admin action
          {!isLoading && ` • ${total.toLocaleString('en-IN')} entries`}
        </p>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              Action
            </label>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="input min-w-[200px]"
            >
              {ACTION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              Target type
            </label>
            <select
              value={targetType}
              onChange={(e) => setTargetType(e.target.value)}
              className="input min-w-[160px]"
            >
              {TARGET_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
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
          emptyMessage="No audit log entries match these filters."
        />

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-6 py-3 text-sm">
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

      {/* Diff modal */}
      {diffOpen && diffLog && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-gray-900/50 p-4 sm:items-center">
          <div className="card w-full max-w-4xl p-6">
            <div className="mb-4 flex items-start justify-between">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-primary" />
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    Audit entry
                  </h2>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                    <ActionBadge action={diffLog.action} />
                    <span>•</span>
                    <span>{new Date(diffLog.createdAt).toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={closeDiff}
                className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-4 grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
              <div className="rounded-md bg-gray-50 px-3 py-2">
                <p className="font-semibold uppercase tracking-wider text-gray-400">
                  Actor
                </p>
                <p className="font-mono text-gray-800">
                  {diffLog.actorId ?? '—'}
                </p>
              </div>
              <div className="rounded-md bg-gray-50 px-3 py-2">
                <p className="font-semibold uppercase tracking-wider text-gray-400">
                  Target
                </p>
                <p className="text-gray-800">{diffLog.targetType ?? '—'}</p>
                <p className="font-mono text-[10px] text-gray-500">
                  {diffLog.targetId ?? '—'}
                </p>
              </div>
              <div className="rounded-md bg-gray-50 px-3 py-2">
                <p className="font-semibold uppercase tracking-wider text-gray-400">
                  Reason
                </p>
                <p className="text-gray-800">
                  {diffLog.reason ?? <span className="text-gray-400">—</span>}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-red-600">
                  Before
                </p>
                <pre className="max-h-96 overflow-auto rounded-md border border-red-100 bg-red-50/40 p-3 text-xs text-gray-800">
                  {diffLog.before == null
                    ? '—'
                    : JSON.stringify(diffLog.before, null, 2)}
                </pre>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-green-600">
                  After
                </p>
                <pre className="max-h-96 overflow-auto rounded-md border border-green-100 bg-green-50/40 p-3 text-xs text-gray-800">
                  {diffLog.after == null
                    ? '—'
                    : JSON.stringify(diffLog.after, null, 2)}
                </pre>
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button onClick={closeDiff} className="btn-secondary">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
