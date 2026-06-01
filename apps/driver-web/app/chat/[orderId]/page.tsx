'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, MessageCircle, Send } from 'lucide-react';
import { Button } from '@aks/ui/components/button';
import { Card, CardContent } from '@aks/ui/components/card';
import { toast } from '@aks/ui/components/sonner';
import { AppHeader } from '@/components/AppHeader';
import { RequireAuth } from '@/components/RequireAuth';
import { api, unwrap } from '@/lib/api';
import { getStoredUser } from '@/lib/auth';
import { getSocket } from '@/lib/socket';

// Per-order chat thread between driver and the other party (customer or
// store) of an active delivery. Mirrors apps/driver/app/chat/[orderId].tsx —
// same /api/v1/chats endpoints and same socket events (chat:join,
// chat:leave, chat:message) so messages sync between mobile and web.

interface ChatResolveResponse {
  id: string;
  orderId: string;
  otherUserId: string;
  otherUser: { id: string; name: string | null; role: string } | null;
  orderStatus: string;
  canSend: boolean;
}

interface ChatMessage {
  id: string;
  chatId: string;
  senderId: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

function roleLabel(role: string | undefined): string {
  switch (role) {
    case 'CUSTOMER':
      return 'Customer';
    case 'STORE_OWNER':
      return 'Store';
    case 'DRIVER':
      return 'Driver';
    default:
      return 'Order chat';
  }
}

export default function ChatPage() {
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
  const params = useParams<{ orderId: string }>();
  const router = useRouter();
  const orderId = params?.orderId;
  const queryClient = useQueryClient();
  const me = useMemo(() => getStoredUser(), []);
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const chatQuery = useQuery<ChatResolveResponse | null>({
    queryKey: ['chat', orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const res = await api.get(`/api/v1/chats/order/${orderId}`);
      return unwrap<ChatResolveResponse>(res.data);
    },
  });

  const chatId = chatQuery.data?.id ?? null;
  const otherUser = chatQuery.data?.otherUser ?? null;
  const canSend = chatQuery.data?.canSend ?? false;

  const messagesQuery = useQuery<ChatMessage[]>({
    queryKey: ['chat-messages', chatId],
    enabled: !!chatId,
    queryFn: async () => {
      const res = await api.get(`/api/v1/chats/${chatId}/messages`);
      return unwrap<ChatMessage[]>(res.data) ?? [];
    },
  });
  const messages = messagesQuery.data ?? [];

  // Live updates via socket
  useEffect(() => {
    if (!chatId) return;
    const socket = getSocket();
    if (!socket) return;
    socket.emit('chat:join', chatId);
    function onMessage(msg: ChatMessage) {
      if (msg.chatId !== chatId) return;
      queryClient.setQueryData<ChatMessage[]>(['chat-messages', chatId], (prev) => {
        if (!prev) return [msg];
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    }
    socket.on('chat:message', onMessage);
    return () => {
      socket.off('chat:message', onMessage);
      socket.emit('chat:leave', chatId);
    };
  }, [chatId, queryClient]);

  useEffect(() => {
    if (messages.length === 0) return;
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    });
  }, [messages.length]);

  const sendMutation = useMutation({
    mutationFn: async (body: string) => {
      const res = await api.post(`/api/v1/chats/${chatId}/messages`, { body });
      return unwrap<ChatMessage>(res.data);
    },
    onMutate: async (body) => {
      if (!chatId) return;
      const optimistic: ChatMessage = {
        id: 'temp-' + Date.now(),
        chatId,
        senderId: me?.id ?? '',
        body,
        readAt: null,
        createdAt: new Date().toISOString(),
      };
      queryClient.setQueryData<ChatMessage[]>(['chat-messages', chatId], (prev) => [
        ...(prev ?? []),
        optimistic,
      ]);
      setDraft('');
      return { optimisticId: optimistic.id };
    },
    onSuccess: (real, _body, ctx) => {
      if (!real || !ctx || !chatId) return;
      queryClient.setQueryData<ChatMessage[]>(['chat-messages', chatId], (prev) => {
        const next = (prev ?? []).filter((m) => m.id !== ctx.optimisticId);
        if (next.some((m) => m.id === real.id)) return next;
        return [...next, real];
      });
    },
    onError: (err: Error, _body, ctx) => {
      if (ctx && chatId) {
        queryClient.setQueryData<ChatMessage[]>(['chat-messages', chatId], (prev) =>
          (prev ?? []).filter((m) => m.id !== ctx.optimisticId),
        );
      }
      toast.error(err.message || 'Could not send message');
    },
  });

  function handleSend(e?: React.FormEvent) {
    e?.preventDefault();
    const body = draft.trim();
    if (!body || !chatId || !canSend || sendMutation.isPending) return;
    sendMutation.mutate(body);
  }

  if (chatQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-gray-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading chat…
      </div>
    );
  }

  if (chatQuery.isError || !chatQuery.data) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
          <MessageCircle className="h-7 w-7 text-gray-300" />
          <p className="text-sm font-bold text-gray-900">Chat unavailable</p>
          <p className="max-w-sm text-xs text-gray-500">
            Either this order doesn&apos;t exist or the chat hasn&apos;t been
            unlocked yet. Try again from the delivery detail page.
          </p>
          <Button variant="outline" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        </CardContent>
      </Card>
    );
  }

  const headline = otherUser?.name
    ? `${roleLabel(otherUser.role)} · ${otherUser.name.split(' ')[0]}`
    : roleLabel(otherUser?.role);

  return (
    <div className="mx-auto flex h-[calc(100vh-9rem)] max-w-3xl flex-col gap-3">
      <header className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold text-gray-900">{headline}</h1>
          <p className="text-xs text-gray-500">
            Order #{chatQuery.data.orderId.slice(-6).toUpperCase()} · {chatQuery.data.orderStatus}
          </p>
        </div>
        <Link
          href={`/deliveries/${chatQuery.data.orderId}` as never}
          className="text-xs font-semibold text-primary hover:underline"
        >
          Open delivery
        </Link>
      </header>

      <Card className="flex-1 overflow-hidden">
        <CardContent className="flex h-full flex-col p-0">
          {messagesQuery.isLoading ? (
            <div className="flex flex-1 items-center justify-center text-sm text-gray-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading messages…
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-sm text-gray-500">
              <MessageCircle className="h-6 w-6 text-gray-300" />
              <p>No messages yet — say hello.</p>
            </div>
          ) : (
            <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
              {messages.map((m) => (
                <Bubble key={m.id} message={m} mine={m.senderId === me?.id} />
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
              placeholder={
                canSend ? 'Type your message…' : 'Chat is read-only for this order.'
              }
              rows={1}
              maxLength={1000}
              disabled={!canSend || sendMutation.isPending}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              className="flex max-h-32 min-h-[40px] w-full resize-none rounded-md border border-input bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:bg-gray-50 disabled:text-gray-400"
            />
            <Button type="submit" disabled={!draft.trim() || !canSend || sendMutation.isPending}>
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

function Bubble({ message, mine }: { message: ChatMessage; mine: boolean }) {
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
          mine ? 'bg-primary text-primary-foreground' : 'bg-gray-100 text-gray-900'
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
