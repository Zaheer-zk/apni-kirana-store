'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, LifeBuoy, Loader2, Send } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@aks/ui/components/button';
import { Card, CardContent } from '@aks/ui/components/card';
import { toast } from '@aks/ui/components/sonner';
import { AppHeader } from '@/components/AppHeader';
import { RequireAuth } from '@/components/RequireAuth';
import { api, unwrap } from '@/lib/api';
import { getStoredUser } from '@/lib/auth';
import { getSocket } from '@/lib/socket';

// Per-user support thread with admin. Mirrors apps/driver/app/profile/support.tsx —
// same backend endpoints (`/api/v1/support/me/messages`) and same socket
// events (`support:join`, `support:leave`, `support:message`) so a driver
// can pick up the conversation on either surface without state diverging.

interface SupportThread {
  id: string;
  userId: string;
  status: 'OPEN' | 'RESOLVED';
  lastMessage: string | null;
  userUnread: number;
}

interface SupportMessage {
  id: string;
  threadId: string;
  senderId: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

interface SupportMeResponse {
  thread: SupportThread;
  messages: SupportMessage[];
}

export default function SupportPage() {
  return (
    <RequireAuth>
      <div className="flex min-h-screen flex-col bg-gray-50">
        <AppHeader />
        <main className="page-shell flex-1 py-6">
          <Inner />
        </main>
      </div>
    </RequireAuth>
  );
}

function Inner() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const me = useMemo(() => getStoredUser(), []);

  const query = useQuery<SupportMeResponse | null>({
    queryKey: ['support-me'],
    queryFn: async () => {
      const r = await api.get('/api/v1/support/me/messages');
      return unwrap<SupportMeResponse>(r.data);
    },
    refetchOnWindowFocus: true,
  });

  const thread = query.data?.thread ?? null;
  const messages = useMemo(() => query.data?.messages ?? [], [query.data]);

  // Live updates via socket — only after the thread exists (a fresh user
  // doesn't have one until they send the first message).
  useEffect(() => {
    if (!thread?.id) return;
    const socket = getSocket();
    if (!socket) return;
    socket.emit('support:join', thread.id);
    function onMessage(msg: SupportMessage) {
      if (msg.threadId !== thread!.id) return;
      queryClient.setQueryData<SupportMeResponse | null>(['support-me'], (prev) => {
        if (!prev) return prev;
        if (prev.messages.some((m) => m.id === msg.id)) return prev;
        return { ...prev, messages: [...prev.messages, msg] };
      });
    }
    socket.on('support:message', onMessage);
    return () => {
      socket.off('support:message', onMessage);
      socket.emit('support:leave', thread.id);
    };
  }, [thread?.id, queryClient]);

  // Auto-scroll to the newest message whenever the list grows.
  useEffect(() => {
    if (messages.length === 0) return;
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    });
  }, [messages.length]);

  const sendMutation = useMutation({
    mutationFn: async (body: string) => {
      const r = await api.post('/api/v1/support/me/messages', { body });
      return unwrap<SupportMessage>(r.data);
    },
    onMutate: async (body) => {
      const optimistic: SupportMessage = {
        id: 'temp-' + Date.now(),
        threadId: thread?.id ?? '',
        senderId: me?.id ?? '',
        body,
        readAt: null,
        createdAt: new Date().toISOString(),
      };
      queryClient.setQueryData<SupportMeResponse | null>(['support-me'], (prev) =>
        prev ? { ...prev, messages: [...prev.messages, optimistic] } : prev,
      );
      setDraft('');
      return { optimisticId: optimistic.id };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-me'] });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Could not send message');
      // The optimistic insert stays — user can retry by typing the same
      // body again. We don't roll back automatically because losing the
      // unsent message would be more disorienting than the duplicate.
    },
  });

  function handleSend(e?: React.FormEvent) {
    e?.preventDefault();
    const body = draft.trim();
    if (!body || sendMutation.isPending) return;
    sendMutation.mutate(body);
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-9rem)] max-w-3xl flex-col gap-3">
      <header className="flex items-center gap-3">
        <Link
          href="/help"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100"
          aria-label="Back to Help"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex flex-1 items-center gap-2">
          <LifeBuoy className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-lg font-bold text-gray-900">Chat with admin</h1>
            <p className="text-xs text-gray-500">
              {thread?.status === 'RESOLVED'
                ? 'Marked resolved — send a new message to reopen.'
                : 'Replies usually arrive during business hours.'}
            </p>
          </div>
        </div>
      </header>

      <Card className="flex-1 overflow-hidden">
        <CardContent className="flex h-full flex-col gap-2 p-0">
          {query.isLoading ? (
            <div className="flex flex-1 items-center justify-center text-sm text-gray-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading messages…
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-sm text-gray-500">
              <LifeBuoy className="h-6 w-6 text-gray-300" />
              <p>Send your first message — an admin will reply here and on your mobile app.</p>
            </div>
          ) : (
            <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} mine={m.senderId === me?.id} />
              ))}
            </div>
          )}

          <form
            onSubmit={handleSend}
            className="flex items-end gap-2 border-t border-gray-100 bg-white p-3"
          >
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Type your message…"
              rows={1}
              maxLength={1000}
              disabled={sendMutation.isPending}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              className="flex max-h-32 min-h-[40px] w-full resize-none rounded-md border border-input bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
            <Button type="submit" disabled={!draft.trim() || sendMutation.isPending}>
              {sendMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Send
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function MessageBubble({ message, mine }: { message: SupportMessage; mine: boolean }) {
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
          mine
            ? 'bg-primary text-primary-foreground'
            : 'bg-gray-100 text-gray-900'
        }`}
      >
        <p className="whitespace-pre-wrap break-words">{message.body}</p>
        <p
          className={`mt-1 text-[10px] ${
            mine ? 'text-primary-foreground/70' : 'text-gray-500'
          }`}
        >
          {new Date(message.createdAt).toLocaleTimeString('en-IN', {
            hour: 'numeric',
            minute: '2-digit',
          })}
        </p>
      </div>
    </div>
  );
}
