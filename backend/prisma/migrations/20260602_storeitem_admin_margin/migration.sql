-- Two-tier pricing model (2026-06-02 decision):
--   StoreItem.price       — store owner's payout per unit (e.g. ₹18)
--   StoreItem.adminMargin — admin's commission per unit, added on top (e.g. ₹2)
-- Customer pays `price + adminMargin` (e.g. ₹20).
-- Per-line commission = adminMargin × qty.
--
-- Default 0 so existing inventory keeps its current effective price (admin
-- can set margins progressively per StoreItem from the admin catalog UI).

ALTER TABLE "StoreItem"
  ADD COLUMN IF NOT EXISTS "adminMargin" DOUBLE PRECISION NOT NULL DEFAULT 0;
