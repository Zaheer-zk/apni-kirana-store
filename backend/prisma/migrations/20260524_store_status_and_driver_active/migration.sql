-- Approval gate for stores (mirrors the existing DriverStatus.PENDING_APPROVAL
-- pattern). Adds StoreStatus enum, Store.status column, and the ACTIVE value
-- on DriverStatus.
--
-- Data-preserving:
--   - All existing stores are backfilled to ACTIVE (they were created before
--     approval gating; treating them as approved is the safe default).
--   - DriverStatus existing rows are untouched; ACTIVE simply becomes a new
--     legal value alongside PENDING_APPROVAL / OFFLINE / ONLINE / SUSPENDED.
--
-- This migration is part of the auth-overhaul series alongside
-- 20260524_user_email_username. Apply both with `prisma migrate deploy`.

-- 1. StoreStatus enum + Store.status column ─────────────────────────────────
CREATE TYPE "StoreStatus" AS ENUM ('PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED');

ALTER TABLE "Store"
  ADD COLUMN "status" "StoreStatus" NOT NULL DEFAULT 'PENDING_APPROVAL';

-- Backfill: every store that existed before approval gating is treated as
-- already approved.
UPDATE "Store" SET "status" = 'ACTIVE';

-- 2. DriverStatus: add ACTIVE value ─────────────────────────────────────────
-- (postgres-safe online ALTER, idempotent if rerun)
ALTER TYPE "DriverStatus" ADD VALUE IF NOT EXISTS 'ACTIVE';
