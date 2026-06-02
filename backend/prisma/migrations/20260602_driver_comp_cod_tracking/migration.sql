-- Driver compensation model + COD reconciliation (2026-06-02 design).
-- Per-order delivery fee remains the default. Admin can promote a driver
-- to SALARY (with a fixed monthlyAmount) after the 30-day/3-orders-per-day
-- average eligibility. COD reconciliation flips per Order so partial
-- settlements stay visible.

-- New enum for driver compensation model. Idempotent — Postgres has no
-- IF NOT EXISTS on CREATE TYPE so we wrap the create in a DO block.
DO $$ BEGIN
  CREATE TYPE "DriverCompensationType" AS ENUM ('PER_ORDER', 'SALARY');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Driver compensation fields. Default PER_ORDER keeps existing drivers
-- unchanged. monthlySalary stays null until admin promotes to SALARY.
ALTER TABLE "Driver"
  ADD COLUMN IF NOT EXISTS "compensationType" "DriverCompensationType" NOT NULL DEFAULT 'PER_ORDER';

ALTER TABLE "Driver"
  ADD COLUMN IF NOT EXISTS "monthlySalary" DOUBLE PRECISION;

-- COD reconciliation on Order. codCollected = admin received the cash
-- from the driver. Only flips on CASH_ON_DELIVERY orders (left false on
-- online-paid ones).
ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "codCollected" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "codCollectedAt" TIMESTAMP(3);

-- Index to keep the "outstanding COD per driver" query fast.
CREATE INDEX IF NOT EXISTS "Order_driverId_codCollected_idx"
  ON "Order"("driverId", "codCollected")
  WHERE "paymentMethod" = 'CASH_ON_DELIVERY';
