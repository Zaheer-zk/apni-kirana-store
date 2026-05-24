// =====================================================================================
// Audit log helper — single entry point for writing AuditLog rows from any
// admin mutation route. Wraps `prisma.auditLog.create` with a typed signature,
// swallows errors so audit failures never break the actual operation, and
// keeps the data shape consistent across the codebase.
//
// Usage:
//   await writeAudit({
//     actorId: req.user!.id,
//     action: 'store.approve',
//     entity: 'Store',
//     entityId: store.id,
//     before: { status: 'PENDING_APPROVAL' },
//     after: { status: 'ACTIVE' },
//     ip: req.ip,
//   });
//
// The AuditLog schema uses `targetType`/`targetId`; we accept `entity`/`entityId`
// in the helper signature (matches the brief + reads naturally) and translate.
// =====================================================================================

import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';

export interface WriteAuditArgs {
  /** Admin user id performing the action. */
  actorId: string;
  /** Stable, dot-separated action key (e.g. "store.approve", "user.suspend"). */
  action: string;
  /** Entity model name (e.g. "User", "Store", "Driver", "Order"). */
  entity: string;
  /** Primary key of the affected entity. */
  entityId: string;
  /** Snapshot of the entity before the change (optional). */
  before?: Record<string, unknown> | null;
  /** Snapshot of the entity after the change (optional). */
  after?: Record<string, unknown> | null;
  /** Optional human-readable reason (admin-provided). */
  reason?: string | null;
  /** Originating IP — stashed in `after.__ip` so the existing schema fits. */
  ip?: string | null;
}

/**
 * Persist an audit-log row. Never throws; logs a warning on failure so the
 * caller can `await` it without try/catch noise.
 */
export async function writeAudit(args: WriteAuditArgs): Promise<void> {
  try {
    // Stash the originating IP inside `after` (the existing AuditLog schema
    // doesn't have a dedicated ip column). Use a reserved key so it won't
    // collide with real entity fields.
    const after =
      args.ip && args.after
        ? { ...args.after, __ip: args.ip }
        : args.ip
          ? { __ip: args.ip }
          : args.after ?? undefined;

    await prisma.auditLog.create({
      data: {
        actorId: args.actorId,
        action: args.action,
        targetType: args.entity,
        targetId: args.entityId,
        before: (args.before ?? Prisma.JsonNull) as Prisma.InputJsonValue | typeof Prisma.JsonNull,
        after: (after ?? Prisma.JsonNull) as Prisma.InputJsonValue | typeof Prisma.JsonNull,
        reason: args.reason ?? null,
      },
    });
  } catch (err) {
    // Audit failures must NOT break the actual operation. Just warn.
    if (process.env.NODE_ENV !== 'test') {
      console.warn(
        `[Audit] failed to write ${args.action} on ${args.entity}:${args.entityId}:`,
        (err as Error).message,
      );
    }
  }
}
