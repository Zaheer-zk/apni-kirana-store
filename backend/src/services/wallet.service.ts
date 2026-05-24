// =====================================================================================
// Wallet service — credit/debit primitives for the customer wallet ledger.
//
// Money is stored in PAISE (₹1 = 100) throughout to avoid floating-point
// rounding. All credit/debit operations run inside a `prisma.$transaction`
// so the balance update + WalletTransaction row are written atomically.
//
// Public API:
//   - getOrCreateWallet(userId)         — lazy-creates a wallet row
//   - creditWallet({ ... })             — positive movement (refund / promo / goodwill)
//   - debitWallet({ ... })              — negative movement; throws on insufficient funds
//   - getWalletWithTxns(userId, limit?) — balance + recent transactions for the UI
//
// `kind` is one of WalletTxnKind. The ledger is append-only — never mutate
// existing rows; correct mistakes with a matching reverse transaction.
// =====================================================================================

import { Prisma, Wallet, WalletTransaction, WalletTxnKind } from '@prisma/client';
import { prisma } from '../config/prisma';

export const WALLET_CURRENCY = 'INR';

export class InsufficientFundsError extends Error {
  code = 'INSUFFICIENT_FUNDS' as const;
  constructor(message = 'INSUFFICIENT_FUNDS') {
    super(message);
    this.name = 'InsufficientFundsError';
  }
}

/**
 * Returns the user's wallet, lazily creating it the first time. Idempotent.
 */
export async function getOrCreateWallet(userId: string): Promise<Wallet> {
  const existing = await prisma.wallet.findUnique({ where: { userId } });
  if (existing) return existing;
  // upsert avoids a race when two callers create concurrently
  return prisma.wallet.upsert({
    where: { userId },
    update: {},
    create: { userId, balance: 0 },
  });
}

interface CreditArgs {
  userId: string;
  amount: number; // positive paise
  kind: WalletTxnKind;
  orderId?: string;
  note?: string;
  actorId?: string;
}

/**
 * Credit `amount` paise to the user's wallet and append a WalletTransaction.
 * `amount` MUST be a positive integer (paise). The balance update + tx row
 * write happen in the same database transaction.
 */
export async function creditWallet(args: CreditArgs): Promise<WalletTransaction> {
  const { userId, amount, kind, orderId, note, actorId } = args;
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(`creditWallet: amount must be a positive integer paise, got ${amount}`);
  }

  // Ensure the wallet exists outside the tx so we can lock by id inside.
  await getOrCreateWallet(userId);

  return prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.update({
      where: { userId },
      data: { balance: { increment: amount } },
    });
    return tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        kind,
        amount, // positive (credit)
        balanceAfter: wallet.balance,
        orderId: orderId ?? null,
        note: note ?? null,
        actorId: actorId ?? null,
      },
    });
  });
}

interface DebitArgs {
  userId: string;
  amount: number; // positive paise (we store it as negative)
  kind: WalletTxnKind;
  orderId?: string;
  note?: string;
  actorId?: string;
}

/**
 * Debit `amount` paise from the user's wallet. Throws InsufficientFundsError
 * if the wallet doesn't have enough balance. Amount is supplied positive;
 * the stored WalletTransaction.amount is negative.
 */
export async function debitWallet(args: DebitArgs): Promise<WalletTransaction> {
  const { userId, amount, kind, orderId, note, actorId } = args;
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(`debitWallet: amount must be a positive integer paise, got ${amount}`);
  }

  await getOrCreateWallet(userId);

  return prisma.$transaction(async (tx) => {
    const current = await tx.wallet.findUniqueOrThrow({ where: { userId } });
    if (current.balance < amount) {
      throw new InsufficientFundsError();
    }
    const wallet = await tx.wallet.update({
      where: { userId },
      data: { balance: { decrement: amount } },
    });
    return tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        kind,
        amount: -amount, // stored signed
        balanceAfter: wallet.balance,
        orderId: orderId ?? null,
        note: note ?? null,
        actorId: actorId ?? null,
      },
    });
  });
}

export interface WalletView {
  balance: number; // paise
  currency: typeof WALLET_CURRENCY;
  transactions: WalletTransaction[];
}

/**
 * Returns balance + the most-recent `limit` transactions for the wallet UI.
 * If the user has no wallet yet, returns an empty view (balance 0, no txns)
 * WITHOUT creating one — read-only operations shouldn't side-effect.
 */
export async function getWalletWithTxns(userId: string, limit = 50): Promise<WalletView> {
  const wallet = await prisma.wallet.findUnique({
    where: { userId },
    include: {
      transactions: {
        orderBy: { createdAt: 'desc' },
        take: limit,
      },
    },
  });
  if (!wallet) {
    return { balance: 0, currency: WALLET_CURRENCY, transactions: [] };
  }
  return {
    balance: wallet.balance,
    currency: WALLET_CURRENCY,
    transactions: wallet.transactions,
  };
}

// Re-export types for convenience
export type { Wallet, WalletTransaction, WalletTxnKind };
export type { Prisma };
