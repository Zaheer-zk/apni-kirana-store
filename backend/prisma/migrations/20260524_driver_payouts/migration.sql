-- Driver payouts — one row per driver per weekly period.
-- Data-preserving (purely additive).

CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'PAID', 'FAILED');

CREATE TABLE "Payout" (
  "id"           TEXT          NOT NULL PRIMARY KEY,
  "driverId"     TEXT          NOT NULL,
  "periodStart"  TIMESTAMP(3)  NOT NULL,
  "periodEnd"    TIMESTAMP(3)  NOT NULL,
  "orderCount"   INTEGER       NOT NULL,
  "gross"        DOUBLE PRECISION NOT NULL,
  "deductions"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  "net"          DOUBLE PRECISION NOT NULL,
  "status"       "PayoutStatus" NOT NULL DEFAULT 'PENDING',
  "reference"    TEXT,
  "notes"        TEXT,
  "paidAt"       TIMESTAMP(3),
  "paidByUserId" TEXT,
  "createdAt"    TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3)  NOT NULL
);

-- One payout per driver per period.
CREATE UNIQUE INDEX "Payout_driverId_periodStart_key" ON "Payout"("driverId", "periodStart");
CREATE INDEX "Payout_status_idx" ON "Payout"("status");
CREATE INDEX "Payout_driverId_periodEnd_idx" ON "Payout"("driverId", "periodEnd");

ALTER TABLE "Payout"
  ADD CONSTRAINT "Payout_driverId_fkey"
  FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;
