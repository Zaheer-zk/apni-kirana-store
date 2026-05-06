-- Promos: admin-created discount codes; customers redeem at checkout.

BEGIN;

-- Order extension: store applied promo info on each order
ALTER TABLE "Order" ADD COLUMN "promoCode" TEXT;
ALTER TABLE "Order" ADD COLUMN "promoDiscount" DOUBLE PRECISION;

-- Promo type
DO $$ BEGIN
  CREATE TYPE "DiscountType" AS ENUM ('FLAT', 'PERCENT');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE "Promo" (
  "id"             TEXT NOT NULL,
  "code"           TEXT NOT NULL,
  "description"    TEXT,
  "discountType"   "DiscountType" NOT NULL,
  "discountValue"  DOUBLE PRECISION NOT NULL,
  "maxDiscount"    DOUBLE PRECISION,
  "minOrderValue"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  "usageLimit"     INTEGER,
  "perUserLimit"   INTEGER,
  "usedCount"      INTEGER NOT NULL DEFAULT 0,
  "validFrom"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "validUntil"     TIMESTAMP(3),
  "isActive"       BOOLEAN NOT NULL DEFAULT true,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Promo_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Promo_code_key" ON "Promo"("code");
CREATE INDEX "Promo_code_idx" ON "Promo"("code");
CREATE INDEX "Promo_isActive_idx" ON "Promo"("isActive");

CREATE TABLE "PromoRedemption" (
  "id"        TEXT NOT NULL,
  "promoId"   TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "orderId"   TEXT NOT NULL,
  "discount"  DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PromoRedemption_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PromoRedemption_orderId_key" ON "PromoRedemption"("orderId");
CREATE INDEX "PromoRedemption_promoId_userId_idx" ON "PromoRedemption"("promoId", "userId");

ALTER TABLE "PromoRedemption"
  ADD CONSTRAINT "PromoRedemption_promoId_fkey"
    FOREIGN KEY ("promoId") REFERENCES "Promo"("id") ON DELETE CASCADE;

COMMIT;
