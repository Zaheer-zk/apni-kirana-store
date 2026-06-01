-- "Order for someone else" — recipient contact different from the account
-- holder. Driver/store calls these at dropoff if present. Optional + data-
-- preserving.

ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "recipientName"  TEXT,
  ADD COLUMN IF NOT EXISTS "recipientPhone" TEXT;
