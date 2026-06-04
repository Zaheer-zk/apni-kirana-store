-- OrderGroup: parent row for multi-store carts. Existing single-store
-- orders leave orderGroupId null and continue to behave exactly as
-- before, so this migration is purely additive (safe to apply on a live
-- DB without coordinated app rollout).

CREATE TABLE IF NOT EXISTS "OrderGroup" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "deliveryAddressId" TEXT NOT NULL,
  "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
  "subtotal" DOUBLE PRECISION NOT NULL,
  "deliveryFee" DOUBLE PRECISION NOT NULL,
  "total" DOUBLE PRECISION NOT NULL,
  "paymentMethod" "PaymentMethod" NOT NULL,
  "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "driverId" TEXT,
  "recipientName" TEXT,
  "recipientPhone" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrderGroup_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OrderGroup_customerId_status_idx"
  ON "OrderGroup"("customerId", "status");
CREATE INDEX IF NOT EXISTS "OrderGroup_driverId_idx"
  ON "OrderGroup"("driverId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'OrderGroup_customerId_fkey'
  ) THEN
    ALTER TABLE "OrderGroup"
      ADD CONSTRAINT "OrderGroup_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'OrderGroup_deliveryAddressId_fkey'
  ) THEN
    ALTER TABLE "OrderGroup"
      ADD CONSTRAINT "OrderGroup_deliveryAddressId_fkey"
      FOREIGN KEY ("deliveryAddressId") REFERENCES "Address"("id") ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'OrderGroup_driverId_fkey'
  ) THEN
    ALTER TABLE "OrderGroup"
      ADD CONSTRAINT "OrderGroup_driverId_fkey"
      FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- Child Order rows gain the FK column. Idempotent: re-running on a DB
-- where the column already exists is a no-op. Index supports the
-- "all orders in this group" lookup that the customer / admin rollups
-- + the driver multi-pickup screen will hit.
ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "orderGroupId" TEXT;

CREATE INDEX IF NOT EXISTS "Order_orderGroupId_idx"
  ON "Order"("orderGroupId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Order_orderGroupId_fkey'
  ) THEN
    ALTER TABLE "Order"
      ADD CONSTRAINT "Order_orderGroupId_fkey"
      FOREIGN KEY ("orderGroupId") REFERENCES "OrderGroup"("id") ON DELETE SET NULL;
  END IF;
END $$;
