import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation } from 'expo-router';
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
import { api } from '@/lib/api';
import { initSocket } from '@/lib/socket';
import { useDriverStore } from '@/store/driver.store';
import { colors, fontSize, radius, spacing } from '@/constants/theme';

interface ChatResolveResponse {
  id: string;
  orderId: string;
  otherUserId: string;
  otherUser: { id: string; name: string | null; role: string } | null;
  orderStatus: string;
  canSend: boolean;
}

function roleLabel(role: string | undefined): string {
  switch (role) {
    case 'CUSTOMER':    return 'Customer';
    case 'STORE_OWNER': return 'Store';
    case 'DRIVER':      return 'Driver';
    default:            return 'Order';
  }
}

interface ChatMessage {
  id: string;
  chatId: string;
  senderId: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

function unwrap<T>(payload: unknown): T | null {
  if (payload && typeof payload === 'object') {
    const o = payload as Record<string, unknown>;
    if (o['data'] !== undefined) return o['data'] as T;
    return o as T;
  }
  return null;
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function ChatScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const navigation = useNavigation();
  const accessToken = useDriverStore((s) => s.accessToken);
  const currentUserId = useDriverStore((s) => s.user?.id);
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const chatQuery = useQuery({
    queryKey: ['chat', orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const res = await api.get(`/api/v1/chats/order/${orderId}`);
      return unwrap<ChatResolveResponse>(res.data);
    },
  });

  const chatId = chatQuery.data?.id;
  const canSend = chatQuery.data?.canSend ?? false;

  const messagesQuery = useQuery({
    queryKey: ['chat-messages', chatId],
    enabled: !!chatId,
    queryFn: async () => {
      const res = await api.get(`/api/v1/chats/${chatId}/messages`);
      return unwrap<ChatMessage[]>(res.data) ?? [];
    },
  });
  const messages = useMemo(() => messagesQuery.data ?? [], [messagesQuery.data]);

  useLayoutEffect(() => {
    const other = chatQuery.data?.otherUser;
    const label = roleLabel(other?.role);
    const name = other?.name?.split(' ')[0];
    navigation.setOptions({
      title: name ? `${label} · ${name}` : label,
    });
  }, [navigation, chatQuery.data]);

  useEffect(() => {
    if (!accessToken || !chatId) return;
    const socket = initSocket(accessToken);
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
  }, [accessToken, chatId, queryClient]);

  useEffect(() => {
    if (messages.length > 0) {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
  }, [messages.length]);

  const sendMutation = useMutation({
    mutationFn: async (body: string) => {
      const res = await api.post(`/api/v1/chats/${chatId}/messages`, { body });
      return unwrap<ChatMessage>(res.data);
    },
    onMutate: async (body) => {
      const optimistic: ChatMessage = {
        id: 'temp-' + Date.now(),
        chatId: chatId!,
        senderId: currentUserId ?? '',
        body,
        readAt: null,
        createdAt: new Date().toISOString(),
      };
      queryClient.setQueryData<ChatMessage[]>(['chat-messages', chatId], (prev) => [
        ...(prev ?? []),
        optimistic,
      ]);
      return { optimisticId: optimistic.id };
    },
    onSuccess: (real, _body, ctx) => {
      if (!real || !ctx) return;
      queryClient.setQueryData<ChatMessage[]>(['chat-messages', chatId], (prev) => {
        const next = (prev ?? []).filter((m) => m.id !== ctx.optimisticId);
        if (next.some((m) => m.id === real.id)) return next;
        return [...next, real];
      });
    },
    onError: (_err, _body, ctx) => {
      if (!ctx) return;
      queryClient.setQueryData<ChatMessage[]>(['chat-messages', chatId], (prev) =>
        (prev ?? []).filter((m) => m.id !== ctx.optimisticId),
      );
    },
  });

  function onSend() {
    const body = draft.trim();
    if (!body || !chatId || !canSend) return;
    setDraft('');
    sendMutation.mutate(body);
  }

  if (chatQuery.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  if (chatQuery.isError || !chatQuery.data) {
    return (
      <View style={styles.center}>
        <Ionicons name="chatbubbles-outline" size={48} color={colors.textMuted} />
        <Text style={styles.empty}>Chat is not available for this order yet.</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
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
              <Ionicons name="chatbubbles" size={36} color={colors.textMuted} />
              <Text style={styles.emptyText}>
                {canSend
                  ? 'Say hi! Coordinate the delivery in real time.'
                  : 'Chat is read-only for this order.'}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const isMine = item.senderId === currentUserId;
            return (
              <View
                style={[
                  styles.bubbleRow,
                  { justifyContent: isMine ? 'flex-end' : 'flex-start' },
                ]}
              >
                <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  <Text style={[styles.bubbleText, isMine && { color: colors.white }]}>
                    {item.body}
                  </Text>
                  <Text
                    style={[
                      styles.bubbleTime,
                      isMine && { color: 'rgba(255,255,255,0.75)' },
                    ]}
                  >
                    {timeOf(item.createdAt)}
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
            placeholder={canSend ? 'Type a message…' : 'Chat is closed for this order'}
            placeholderTextColor={colors.textMuted}
            editable={canSend && !sendMutation.isPending}
            multiline
            maxLength={2000}
          />
          <Pressable
            onPress={onSend}
            disabled={!canSend || draft.trim().length === 0 || sendMutation.isPending}
            style={({ pressed }) => [
              styles.sendBtn,
              (!canSend || draft.trim().length === 0) && styles.sendBtnDisabled,
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
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  empty: { color: colors.textSecondary, textAlign: 'center', fontSize: fontSize.sm },
  emptyBlock: { alignItems: 'center', paddingVertical: spacing.xxxl, gap: spacing.md },
  emptyText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
  listContent: { padding: spacing.lg, flexGrow: 1, gap: spacing.sm },
  bubbleRow: { flexDirection: 'row', width: '100%' },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.lg,
    gap: 4,
  },
  bubbleMine: {
    backgroundColor: colors.primary,
    borderTopRightRadius: 4,
  },
  bubbleTheirs: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  bubbleText: { fontSize: fontSize.sm, color: colors.textPrimary, lineHeight: 20 },
  bubbleTime: { fontSize: 10, color: colors.textMuted, alignSelf: 'flex-end', marginTop: 2 },
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
