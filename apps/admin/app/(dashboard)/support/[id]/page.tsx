'use client';

import { use, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Phone,
  Send,
  LifeBuoy,
} from 'lucide-react';
import { api } from '@/lib/api';

interface SupportMessage {
  id: string;
  threadId: string;
  senderId: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}
interface SupportThread {
  id: string;
  userId: string;
  status: 'OPEN' | 'RESOLVED';
  lastMessage: string | null;
  adminUnread: number;
  createdAt: string;
}
interface ThreadDetail {
  thread: SupportThread;
  user: { id: string; name: string | null; phone: string; role: string } | null;
  messages: SupportMessage[];
}

function roleLabel(role: string | undefined): string {
  switch (role) {
    case 'CUSTOMER':    return 'Customer';
    case 'STORE_OWNER': return 'Store owner';
    case 'DRIVER':      return 'Driver';
    default:            return 'User';
  }
}

function timeOf(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
}

export default function SupportThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);

  const { data, isLoading, isError } = useQuery<ThreadDetail>({
    queryKey: ['support-thread', id],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: ThreadDetail }>(
        `/api/v1/support/admin/threads/${id}`,
      );
      return res.data.data;
    },
    refetchInterval: 5_000,
  });

  // Auto-scroll on new message
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [data?.messages.length]);

  const sendMutation = useMutation({
    mutationFn: async (body: string) => {
      const res = await api.post<{ success: boolean; data: SupportMessage }>(
        `/api/v1/support/admin/threads/${id}/messages`,
        { body },
      );
      return res.data.data;
    },
    onSuccess: () => {
      setDraft('');
      queryClient.invalidateQueries({ queryKey: ['support-thread', id] });
      queryClient.invalidateQueries({ queryKey: ['support-threads'] });
    },
  });

  const resolveMutation = useMutation({
    mutationFn: () => api.put(`/api/v1/support/admin/threads/${id}/resolve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-thread', id] });
      queryClient.invalidateQueries({ queryKey: ['support-threads'] });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        <div className="h-6 w-48 rounded shimmer" />
        <div className="h-4 w-72 rounded shimmer" />
        <div className="card mt-6 h-96" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="py-20 text-center">
        <p className="text-red-500">Couldn&apos;t load this thread.</p>
        <Link
          href="/support"
          className="mt-4 inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Back to inbox
        </Link>
      </div>
    );
  }

  const adminId = data.messages.find((m) => m.senderId !== data.user?.id)?.senderId ?? '';
  const isResolved = data.thread.status === 'RESOLVED';

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/support"
            className="mb-1 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to inbox
          </Link>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900">
              {data.user?.name ?? 'Unknown user'}
            </h1>
            <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary">
              {roleLabel(data.user?.role)}
            </span>
            {isResolved ? (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                Resolved
              </span>
            ) : null}
          </div>
          {data.user?.phone && (
            <a
              href={`tel:${data.user.phone}`}
              className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <Phone className="h-3 w-3" />
              {data.user.phone}
            </a>
          )}
        </div>
        {!isResolved && (
          <button
            type="button"
            onClick={() => resolveMutation.mutate()}
            disabled={resolveMutation.isPending}
            className="btn-secondary text-sm"
          >
            {resolveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <CheckCircle2 className="mr-1.5 h-4 w-4" />
                Mark resolved
              </>
            )}
          </button>
        )}
      </div>

      <div className="card flex flex-1 flex-col overflow-hidden">
        <div
          ref={listRef}
          className="flex-1 space-y-2 overflow-y-auto bg-gray-50 px-4 py-4 sm:px-6"
        >
          {data.messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-gray-400">
              <LifeBuoy className="mb-2 h-8 w-8" />
              <p className="text-sm">
                No messages yet. The user opened this thread but hasn&apos;t typed.
              </p>
            </div>
          ) : (
            data.messages.map((m) => {
              const isFromUser = m.senderId === data.user?.id;
              return (
                <div key={m.id} className="flex flex-col gap-0.5">
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="font-medium text-gray-700">
                      {isFromUser
                        ? `${data.user?.name ?? 'User'} (${roleLabel(data.user?.role)})`
                        : 'Admin'}
                    </span>
                    <time className="text-gray-400">{timeOf(m.createdAt)}</time>
                  </div>
                  <div
                    className={`rounded-md px-3 py-2 text-sm shadow-sm ${
                      isFromUser
                        ? 'self-start max-w-[85%] bg-white text-gray-800'
                        : 'self-end max-w-[85%] bg-primary text-white'
                    }`}
                  >
                    {m.body}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {!isResolved ? (
          <form
            className="flex items-end gap-2 border-t border-gray-100 bg-white p-3"
            onSubmit={(e) => {
              e.preventDefault();
              const body = draft.trim();
              if (body) sendMutation.mutate(body);
            }}
          >
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Reply as Admin…"
              rows={2}
              className="input min-h-[44px] resize-none"
              disabled={sendMutation.isPending}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  const body = draft.trim();
                  if (body) sendMutation.mutate(body);
                }
              }}
            />
            <button
              type="submit"
              className="btn-primary h-11 px-4"
              disabled={sendMutation.isPending || draft.trim().length === 0}
            >
              {sendMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Send className="mr-1 h-3.5 w-3.5" />
                  Send
                </>
              )}
            </button>
          </form>
        ) : (
          <div className="border-t border-gray-100 bg-gray-50 px-4 py-3 text-center text-xs text-gray-500">
            This thread is resolved. Send a new message to re-open it.
          </div>
        )}
      </div>
    </div>
  );
}
