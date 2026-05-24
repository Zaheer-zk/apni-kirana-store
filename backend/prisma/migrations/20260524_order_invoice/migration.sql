-- GST invoice fields on Order. Generated when an order is DELIVERED.
-- Idempotent — uses IF NOT EXISTS so re-runs are safe.

ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "invoiceNumber"      TEXT,
  ADD COLUMN IF NOT EXISTS "invoicePath"        TEXT,
  ADD COLUMN IF NOT EXISTS "invoiceGeneratedAt" TIMESTAMP(3);

-- Per-FY monotonic number: must be globally unique across all orders.
CREATE UNIQUE INDEX IF NOT EXISTS "Order_invoiceNumber_key"
  ON "Order"("invoiceNumber")
  WHERE "invoiceNumber" IS NOT NULL;
