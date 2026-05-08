'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  Cpu,
  Database,
  HardDrive,
  Server,
  Trash2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { api } from '@/lib/api';

interface HealthResponse {
  process: {
    uptimeSeconds: number;
    pid: number;
    nodeVersion: string;
    memory: {
      rssBytes: number;
      heapUsedBytes: number;
      heapTotalBytes: number;
      heapSizeLimitBytes: number;
      externalBytes: number;
    };
  };
  system: {
    platform: string;
    arch: string;
    cpuCount: number;
    cpuModel: string;
    loadAvg: { '1m': number; '5m': number; '15m': number };
    loadPercent: number | null;
    memory: {
      totalBytes: number;
      freeBytes: number;
      usedBytes: number;
      usedPercent: number | null;
    };
  };
  db: { ok: boolean; latencyMs: number | null };
  timestamp: string;
}

interface ErrorEntry {
  id: string;
  at: string;
  message: string;
  stack?: string;
  source: 'request' | 'unhandledRejection' | 'uncaughtException' | 'manual';
  method?: string;
  path?: string;
  statusCode?: number;
  userId?: string;
}

interface ErrorsResponse {
  errors: ErrorEntry[];
  count: number;
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatUptime(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleString('en-IN');
}

function StatTile({
  icon,
  label,
  value,
  hint,
  tone = 'default',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'good' | 'warn' | 'bad';
}) {
  const toneClasses =
    tone === 'good'
      ? 'border-emerald-100 bg-emerald-50'
      : tone === 'warn'
        ? 'border-amber-100 bg-amber-50'
        : tone === 'bad'
          ? 'border-red-100 bg-red-50'
          : 'border-gray-100 bg-white';
  return (
    <div className={`rounded-xl border p-4 ${toneClasses}`}>
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-gray-500">
        {icon}
        {label}
      </div>
      <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-gray-500">{hint}</p> : null}
    </div>
  );
}

function ProgressBar({ percent, tone }: { percent: number; tone: 'good' | 'warn' | 'bad' }) {
  const pct = Math.max(0, Math.min(100, percent * 100));
  const bar =
    tone === 'good' ? 'bg-emerald-500' : tone === 'warn' ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
      <div
        className={`h-full rounded-full transition-all duration-500 ${bar}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function toneFor(value: number, warn: number, bad: number): 'good' | 'warn' | 'bad' {
  if (value >= bad) return 'bad';
  if (value >= warn) return 'warn';
  return 'good';
}

function ErrorRow({ err }: { err: ErrorEntry }) {
  const [open, setOpen] = useState(false);
  const sourceTone =
    err.source === 'uncaughtException'
      ? 'bg-red-100 text-red-700'
      : err.source === 'unhandledRejection'
        ? 'bg-amber-100 text-amber-700'
        : 'bg-gray-100 text-gray-700';

  return (
    <li className="border-b border-gray-50 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-gray-50"
      >
        <div className="mt-0.5 text-gray-400">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${sourceTone}`}
            >
              {err.source}
            </span>
            {err.statusCode ? (
              <span className="rounded bg-red-50 px-2 py-0.5 text-xs font-mono text-red-700">
                {err.statusCode}
              </span>
            ) : null}
            {err.method && err.path ? (
              <span className="font-mono text-xs text-gray-600">
                {err.method} {err.path}
              </span>
            ) : null}
            <span className="ml-auto text-xs text-gray-400">{timeAgo(err.at)}</span>
          </div>
          <p className="mt-1 truncate text-sm font-medium text-gray-900">{err.message}</p>
        </div>
      </button>
      {open && err.stack ? (
        <pre className="overflow-x-auto bg-gray-900 px-4 py-3 text-xs text-gray-100">
          {err.stack}
        </pre>
      ) : null}
    </li>
  );
}

export default function SystemPage() {
  const queryClient = useQueryClient();

  const health = useQuery<HealthResponse>({
    queryKey: ['system-health'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: HealthResponse }>(
        '/api/v1/system/health',
      );
      return res.data.data;
    },
    refetchInterval: 5_000,
    staleTime: 0,
  });

  const errors = useQuery<ErrorsResponse>({
    queryKey: ['system-errors'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: ErrorsResponse }>(
        '/api/v1/system/errors?limit=100',
      );
      return res.data.data;
    },
    refetchInterval: 10_000,
  });

  const clearMutation = useMutation({
    mutationFn: () => api.delete('/api/v1/system/errors'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-errors'] });
    },
  });

  const cpuPct = health.data?.system.loadPercent ?? 0;
  const memPct = health.data?.system.memory.usedPercent ?? 0;
  // Compare heapUsed against the V8 ceiling, not the elastic heapTotal —
  // heapTotal grows on demand, so heapUsed/heapTotal is always near 100%.
  const heapPct = health.data
    ? health.data.process.memory.heapUsedBytes /
      health.data.process.memory.heapSizeLimitBytes
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <Activity className="h-6 w-6 text-primary" />
          System health
        </h1>
        <p className="mt-1 text-sm text-gray-400">
          Live snapshot of the API server and recent errors. Refreshes every 5–10 seconds.
        </p>
      </div>

      {health.isLoading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 rounded-xl shimmer" />
          ))}
        </div>
      ) : health.isError || !health.data ? (
        <div className="card p-6 text-center text-sm text-red-500">
          Couldn&apos;t reach the API. The backend may be down.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div>
              <StatTile
                icon={<Cpu className="h-3.5 w-3.5" />}
                label="CPU load (1m)"
                value={`${(cpuPct * 100).toFixed(0)}%`}
                hint={`${health.data.system.cpuCount} cores · load ${health.data.system.loadAvg['1m'].toFixed(2)}`}
                tone={toneFor(cpuPct, 0.6, 0.85)}
              />
              <ProgressBar percent={Math.min(cpuPct, 1)} tone={toneFor(cpuPct, 0.6, 0.85)} />
            </div>
            <div>
              <StatTile
                icon={<HardDrive className="h-3.5 w-3.5" />}
                label="System memory"
                value={`${(memPct * 100).toFixed(0)}%`}
                hint={`${formatBytes(health.data.system.memory.usedBytes)} / ${formatBytes(health.data.system.memory.totalBytes)}`}
                tone={toneFor(memPct, 0.7, 0.9)}
              />
              <ProgressBar percent={memPct} tone={toneFor(memPct, 0.7, 0.9)} />
            </div>
            <div>
              <StatTile
                icon={<Server className="h-3.5 w-3.5" />}
                label="Heap used"
                value={`${(heapPct * 100).toFixed(0)}%`}
                hint={`${formatBytes(health.data.process.memory.heapUsedBytes)} / ${formatBytes(health.data.process.memory.heapSizeLimitBytes)} limit · RSS ${formatBytes(health.data.process.memory.rssBytes)}`}
                tone={toneFor(heapPct, 0.7, 0.9)}
              />
              <ProgressBar percent={heapPct} tone={toneFor(heapPct, 0.7, 0.9)} />
            </div>
            <StatTile
              icon={<Database className="h-3.5 w-3.5" />}
              label="Database"
              value={health.data.db.ok ? `${health.data.db.latencyMs ?? '?'} ms` : 'Down'}
              hint={health.data.db.ok ? 'PostgreSQL ping OK' : 'Ping failed'}
              tone={health.data.db.ok ? 'good' : 'bad'}
            />
          </div>

          <div className="card p-5">
            <h2 className="text-sm font-semibold text-gray-900">Process</h2>
            <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-gray-400">Uptime</dt>
                <dd className="font-medium text-gray-900">
                  {formatUptime(health.data.process.uptimeSeconds)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-400">Node</dt>
                <dd className="font-medium text-gray-900">{health.data.process.nodeVersion}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-400">PID</dt>
                <dd className="font-medium text-gray-900">{health.data.process.pid}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-400">Platform</dt>
                <dd className="font-medium text-gray-900">
                  {health.data.system.platform} / {health.data.system.arch}
                </dd>
              </div>
            </dl>
          </div>
        </>
      )}

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <h2 className="text-sm font-semibold text-gray-900">Recent errors</h2>
            {errors.data && errors.data.count > 0 ? (
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                {errors.data.count}
              </span>
            ) : null}
          </div>
          {errors.data && errors.data.count > 0 ? (
            <button
              type="button"
              onClick={() => {
                if (confirm('Clear the in-memory error buffer?')) clearMutation.mutate();
              }}
              disabled={clearMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-gray-500 hover:bg-gray-100 hover:text-red-600"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear
            </button>
          ) : null}
        </div>

        {errors.isLoading ? (
          <div className="space-y-1 p-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 rounded shimmer" />
            ))}
          </div>
        ) : errors.isError ? (
          <div className="px-6 py-10 text-center text-sm text-red-500">
            Couldn&apos;t load errors.
          </div>
        ) : !errors.data || errors.data.count === 0 ? (
          <div className="px-6 py-10 text-center">
            <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-gray-200" />
            <p className="text-sm text-gray-500">No errors logged. The API is healthy.</p>
          </div>
        ) : (
          <ul>
            {errors.data.errors.map((e) => (
              <ErrorRow key={e.id} err={e} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
