-- Engine-gap fixes (audit 2026-06-08):
--
--  1. Move broadcast candidate lists OUT of free-text Order.notes /
--     Order.rejectionReason and INTO dedicated String[] columns. The
--     old stash format ("BROADCAST:id1,id2,..." / "[DRIVER_BROADCAST:
--     id1,id2,...]") still won't error on existing rows — the engine
--     simply stops reading/writing the free-text path. New broadcasts
--     write to the array columns; rescind reads from them.
--
--  2. Order.matchingRetryCount + PlatformSetting.matchingMaxRetries
--     cap how many times the queue self-re-enqueues an order. When
--     exceeded → auto-cancel + ORDER_STUCK admin notification.
--
--  3. PlatformSetting.broadcastFanout exposes the previously-hardcoded
--     TOP_N_BROADCAST = 30 so admin can tune it.
--
--  4. Driver.lastDeliveryAt feeds the freshness signal in driver
--     scoring (replaces the constant 1.0 placeholder).
--
-- All additive; safe to run on a populated DB without coordination.

ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "storeBroadcast"    TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "driverBroadcast"   TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "matchingRetryCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Driver"
  ADD COLUMN IF NOT EXISTS "lastDeliveryAt" TIMESTAMP(3);

ALTER TABLE "PlatformSetting"
  ADD COLUMN IF NOT EXISTS "matchingMaxRetries" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS "broadcastFanout"    INTEGER NOT NULL DEFAULT 30;
