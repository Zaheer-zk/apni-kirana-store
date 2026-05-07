// =====================================================================================
// Chat between order participants — customer ↔ store, customer ↔ driver,
// store ↔ driver.
//
// RULES
// ─────
// - Chat is only enabled while the order is "live": STORE_ACCEPTED,
//   DRIVER_ASSIGNED, PICKED_UP. Sending a message outside this window returns
//   400. Reading existing messages always works (until soft-delete).
// - Messages are stored in plain text — no encryption — so support and fraud
//   investigations can review the conversation later.
// - Retention: when an order reaches DELIVERED/CANCELLED/REJECTED we record
//   `closedAt`. A scheduled job soft-deletes the chat 30 days later
//   (deletedAt set, fetches return 410); 90 days later the row + messages are
//   physically removed.
// =====================================================================================

import { prisma } from '../config/prisma';
import { OrderStatus } from '@prisma/client';

const LIVE_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.STORE_ACCEPTED,
  OrderStatus.DRIVER_ASSIGNED,
  OrderStatus.PICKED_UP,
];

const CLOSED_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.DELIVERED,
  OrderStatus.CANCELLED,
  OrderStatus.REJECTED,
];

export const SOFT_DELETE_DAYS = 30;
export const HARD_DELETE_DAYS = 90;

/**
 * Sort two user IDs into the canonical (userAId, userBId) pair so we never
 * create two chats for the same conversation.
 */
function sortPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/**
 * Resolve which other user the current user is allowed to chat with for a
 * given order. Returns null if no chat is allowed (no relationship to the
 * order, or the requested counterpart isn't a participant).
 */
export async function resolveChatPair(
  orderId: string,
  currentUserId: string,
  withUserId?: string,
): Promise<{ otherUserId: string; orderStatus: OrderStatus } | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      store: { select: { ownerId: true } },
      driver: { select: { userId: true } },
    },
  });
  if (!order) return null;

  const participants = new Set<string>([order.customerId]);
  if (order.store?.ownerId) participants.add(order.store.ownerId);
  if (order.driver?.userId) participants.add(order.driver.userId);

  if (!participants.has(currentUserId)) return null;

  if (withUserId) {
    if (!participants.has(withUserId)) return null;
    if (withUserId === currentUserId) return null;
    return { otherUserId: withUserId, orderStatus: order.status };
  }

  // No specific counterpart — pick "the other party". For 2-participant
  // orders that's unambiguous; if all 3 are present, default to customer↔
  // (store|driver depending on who's asking).
  const others = Array.from(participants).filter((id) => id !== currentUserId);
  if (others.length === 0) return null;
  // Prefer customer ↔ driver during PICKED_UP (most useful "where is the rider")
  // Otherwise, customer ↔ store.
  let otherUserId = others[0]!;
  if (currentUserId === order.customerId) {
    if (order.status === OrderStatus.PICKED_UP && order.driver?.userId) {
      otherUserId = order.driver.userId;
    } else if (order.store?.ownerId) {
      otherUserId = order.store.ownerId;
    }
  }
  return { otherUserId, orderStatus: order.status };
}

/**
 * Find or create the chat row for (orderId, currentUserId, otherUserId).
 */
export async function getOrCreateChat(
  orderId: string,
  currentUserId: string,
  otherUserId: string,
): Promise<{ id: string; userAId: string; userBId: string; closedAt: Date | null }> {
  const [userAId, userBId] = sortPair(currentUserId, otherUserId);
  return await prisma.chat.upsert({
    where: { orderId_userAId_userBId: { orderId, userAId, userBId } },
    create: { orderId, userAId, userBId },
    update: {},
    select: { id: true, userAId: true, userBId: true, closedAt: true },
  });
}

export function isOrderLive(status: OrderStatus): boolean {
  return LIVE_ORDER_STATUSES.includes(status);
}

export function isOrderClosed(status: OrderStatus): boolean {
  return CLOSED_ORDER_STATUSES.includes(status);
}

/**
 * Mark all chats associated with an order as closed (gate sending) once the
 * order reaches a terminal state. Idempotent — a no-op if already closed.
 */
export async function closeChatsForOrder(orderId: string): Promise<void> {
  await prisma.chat.updateMany({
    where: { orderId, closedAt: null },
    data: { closedAt: new Date() },
  });
}

/**
 * Retention sweep — call periodically (cron, BullMQ, etc.).
 * - 30 days after closedAt: set deletedAt (soft-delete; reads return 410)
 * - 90 days after closedAt: physically delete the chat + cascade messages
 */
export async function runChatRetention(): Promise<{ softDeleted: number; hardDeleted: number }> {
  const now = Date.now();
  const softCutoff = new Date(now - SOFT_DELETE_DAYS * 24 * 60 * 60 * 1000);
  const hardCutoff = new Date(now - HARD_DELETE_DAYS * 24 * 60 * 60 * 1000);

  const [{ count: softDeleted }, hardResult] = await Promise.all([
    prisma.chat.updateMany({
      where: {
        closedAt: { lte: softCutoff, not: null },
        deletedAt: null,
      },
      data: { deletedAt: new Date() },
    }),
    prisma.chat.deleteMany({
      where: { closedAt: { lte: hardCutoff, not: null } },
    }),
  ]);

  return { softDeleted, hardDeleted: hardResult.count };
}
