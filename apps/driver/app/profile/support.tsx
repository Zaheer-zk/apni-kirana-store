// Support / help chat with the admin team. Same UX pattern as the order chat
// but the thread is per-user not per-order, lives at /support/me on the
// backend, and can be opened any time from Account → Help & Support.
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from 'expo-router';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Socket } from 'socket.io-client';
import { api } from '@/lib/api';
import { initSocket } from '@/lib/socket';
import { useDriverStore } from '@/store/driver.store';
import { colors, fontSize, radius, spacing } from '@/constants/theme';

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

function unwrap<T>(x: unknown): T | null {
  if (x && typeof x === 'object') {
    const o = x as Record<string, unknown>;
    return (o['data'] as T) ?? (o as T);
  }
  return null;
}

const tf = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

export default function SupportScreen() {
  const navigation = useNavigation();
  const accessToken = useDriverStore((s) => s.accessToken);
  const userId = useDriverStore((s) => s.user?.id);
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const listRef = useRef<FlatList<SupportMessage>>(null);
  const socketRef = useRef<Socket | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({ title: 'Help & Support' });
  }, [navigation]);

  const meQuery = useQuery({
    queryKey: ['support-me'],
    queryFn: async () => {
      const r = await api.get('/api/v1/support/me/messages');
      return unwrap<{ thread: SupportThread; messages: SupportMessage[] }>(r.data);
    },
    refetchOnWindowFocus: true,
  });
  const thread = meQuery.data?.thread;
  const messages = useMemo(
    () => meQuery.data?.messages ?? [],
    [meQuery.data?.messages],
  );

  useEffect(() => {
    if (!accessToken || !thread?.id) return;
    const socket = initSocket(accessToken);
    socketRef.current = socket;
    socket.emit('support:join', thread.id);
    function onMessage(msg: SupportMessage) {
      if (msg.threadId !== thread!.id) return;
      queryClient.setQueryData(
        ['support-me'],
        (prev: { thread: SupportThread; messages: SupportMessage[] } | null) => {
          if (!prev) return prev;
          if (prev.messages.some((m) => m.id === msg.id)) return prev;
          return { ...prev, messages: [...prev.messages, msg] };
        },
      );
    }
    socket.on('support:message', onMessage);
    return () => {
      socket.off('support:message', onMessage);
      socket.emit('support:leave', thread.id);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [accessToken, thread?.id, queryClient]);

  useEffect(() => {
    if (messages.length > 0) {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
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
        senderId: userId ?? '',
        body,
        readAt: null,
        createdAt: new Date().toISOString(),
      };
      queryClient.setQueryData(
        ['support-me'],
        (prev: { thread: SupportThread; messages: SupportMessage[] } | null) =>
          prev ? { ...prev, messages: [...prev.messages, optimistic] } : prev,
      );
      return { optimisticId: optimistic.id };
    },
    onSuccess: (real, _b, ctx) => {
      if (!real || !ctx) return;
      queryClient.setQueryData(
        ['support-me'],
        (prev: { thread: SupportThread; messages: SupportMessage[] } | null) => {
          if (!prev) return prev;
          const filtered = prev.messages.filter((m) => m.id !== ctx.optimisticId);
          if (filtered.some((m) => m.id === real.id)) {
            return { ...prev, messages: filtered };
          }
          return { ...prev, messages: [...filtered, real] };
        },
      );
    },
    onError: (_e, _b, ctx) => {
      if (!ctx) return;
      queryClient.setQueryData(
        ['support-me'],
        (prev: { thread: SupportThread; messages: SupportMessage[] } | null) =>
          prev
            ? { ...prev, messages: prev.messages.filter((m) => m.id !== ctx.optimisticId) }
            : prev,
      );
    },
  });

  function onSend() {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    sendMutation.mutate(body);
  }

  if (meQuery.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    // Native Stack header reserves the top inset; left/right for cutouts on Android
    <SafeAreaView style={styles.root} edges={['bottom', 'left', 'right']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyBlock}>
              <Ionicons name="help-buoy-outline" size={42} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>How can we help?</Text>
              <Text style={styles.emptyText}>
                Send a message and our team will reply here. Typical response
                time is under 30 minutes during business hours.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const isMine = item.senderId === userId;
            return (
              <View
                style={[
                  styles.bubbleRow,
                  { justifyContent: isMine ? 'flex-end' : 'flex-start' },
                ]}
              >
                <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  {!isMine && <Text style={styles.adminLabel}>Support</Text>}
                  <Text style={[styles.bubbleText, isMine && { color: colors.white }]}>
                    {item.body}
                  </Text>
                  <Text
                    style={[
                      styles.bubbleTime,
                      isMine && { color: 'rgba(255,255,255,0.75)' },
                    ]}
                  >
                    {tf(item.createdAt)}
                  </Text>
                </View>
              </View>
            );
          }}
        />
        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="Type your message…"
            placeholderTextColor={colors.textMuted}
            editable={!sendMutation.isPending}
            multiline
            maxLength={2000}
          />
          <Pressable
            onPress={onSend}
            disabled={draft.trim().length === 0 || sendMutation.isPending}
            style={({ pressed }) => [
              styles.sendBtn,
              draft.trim().length === 0 && styles.sendBtnDisabled,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Ionicons name="send" size={18} color={colors.white} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  listContent: { padding: spacing.lg, flexGrow: 1, gap: spacing.sm },
  emptyBlock: {
    alignItems: 'center',
    paddingTop: spacing.xxxl + spacing.xl,
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.textPrimary },
  emptyText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  bubbleRow: { flexDirection: 'row', width: '100%' },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.lg,
    gap: 4,
  },
  bubbleMine: { backgroundColor: colors.primary, borderTopRightRadius: 4 },
  bubbleTheirs: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  bubbleText: { fontSize: fontSize.sm, color: colors.textPrimary, lineHeight: 20 },
  bubbleTime: { fontSize: 10, color: colors.textMuted, alignSelf: 'flex-end', marginTop: 2 },
  adminLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.white,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: radius.lg,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.sm,
    color: colors.textPrimary,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: colors.textMuted },
});
