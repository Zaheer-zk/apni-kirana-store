'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { LifeBuoy, Phone, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';

type ThreadStatus = 'OPEN' | 'RESOLVED';

interface SupportThread {
  id: string;
  userId: string;
  status: ThreadStatus;
  lastMessage: string | null;
  lastSenderId: string | null;
  lastAt: string | null;
  adminUnread: number;
  createdAt: string;
  user: { id: string; name: string | null; phone: string; role: string } | null;
}

interface SupportThreadsResponse {
  threads: SupportThread[];
  total: number;
  totalUnread: number;
  page: number;
  limit: number;
  pages: number;
}

const TABS: { key: ThreadStatus | 'ALL'; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'OPEN', label: 'Open' },
  { key: 'RESOLVED', label: 'Resolved' },
];

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString('en-IN');
}

function roleBadge(role: string | undefined) {
  switch (role) {
    case 'CUSTOMER':
      return { label: 'Customer', className: 'bg-blue-50 text-blue-700' };
    case 'STORE_OWNER':
      return { label: 'Store', className: 'bg-emerald-50 text-emerald-700' };
    case 'DRIVER':
      return { label: 'Driver', className: 'bg-amber-50 text-amber-700' };
    default:
      return { label: role ?? 'User', className: 'bg-gray-100 text-gray-700' };
  }
}

export default function SupportInboxPage() {
  const [tab, setTab] = useState<ThreadStatus | 'ALL'>('OPEN');

  const { data, isLoading, isError } = useQuery<SupportThreadsResponse>({
    queryKey: ['support-threads', tab],
    queryFn: async () => {
      const url =
        tab === 'ALL'
          ? '/api/v1/support/admin/threads'
          : `/api/v1/support/admin/threads?status=${tab}`;
      const res = await api.get<{ success: boolean; data: SupportThreadsResponse }>(url);
      return res.data.data;
    },
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <LifeBuoy className="h-6 w-6 text-primary" />
            Support inbox
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            Live help threads from customers, drivers, and store owners.
          </p>
        </div>
        {data && data.totalUnread > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-1 text-sm font-medium text-red-700">
            {data.totalUnread} unread
          </span>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center gap-1 border-b border-gray-100 px-2 py-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                tab === t.key
                  ? 'bg-primary-50 text-primary'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-1 p-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-3">
                <div className="h-10 w-10 rounded-full shimmer" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-1/3 rounded shimmer" />
                  <div className="h-3 w-3/4 rounded shimmer" />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="px-6 py-10 text-center text-sm text-red-500">
            Couldn&apos;t load threads. Try again in a moment.
          </div>
        ) : !data || data.threads.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <LifeBuoy className="mx-auto mb-2 h-8 w-8 text-gray-300" />
            <p className="text-sm text-gray-500">
              {tab === 'OPEN'
                ? "No open conversations. You're all caught up."
                : tab === 'RESOLVED'
                  ? 'Nothing in the resolved list yet.'
                  : 'No support threads yet.'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {data.threads.map((t) => {
              const badge = roleBadge(t.user?.role);
              return (
                <li key={t.id}>
                  <Link
                    href={`/support/${t.id}`}
                    className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-gray-50 sm:px-6"
                  >
                    <div className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary">
                      <LifeBuoy className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-semibold text-gray-900">
                          {t.user?.name ?? 'Unknown user'}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                        {t.status === 'RESOLVED' ? (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                            Resolved
                          </span>
                        ) : null}
                        {t.adminUnread > 0 ? (
                          <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
                            {t.adminUnread}
                          </span>
                        ) : null}
                      </div>
                      <p className="line-clamp-1 text-sm text-gray-600">
                        {t.lastMessage ?? <em className="text-gray-400">No messages yet</em>}
                      </p>
                      <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
                        <span>{relativeTime(t.lastAt ?? t.createdAt)}</span>
                        {t.user?.phone ? (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {t.user.phone}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <ChevronRight className="mt-2 h-4 w-4 flex-shrink-0 text-gray-300" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
