-- Store owners ask admin to add new items to the master catalog.
-- Admin reviews → either APPROVES (creates a CatalogItem + auto-links it
-- back via catalogItemId) or REJECTS with a note. Distinct from
-- CatalogItem.isActive: that's a soft-delete; this is the inbox where new
-- items get born.

-- CreateEnum (idempotent — Postgres has no IF NOT EXISTS on CREATE TYPE)
DO $$ BEGIN
  CREATE TYPE "CatalogRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "CatalogItemRequest" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "requestedBy" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "category" "ItemCategory" NOT NULL,
  "defaultUnit" TEXT NOT NULL,
  "imageUrl" TEXT,
  "priceHint" DOUBLE PRECISION,
  "status" "CatalogRequestStatus" NOT NULL DEFAULT 'PENDING',
  "reviewNote" TEXT,
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "catalogItemId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CatalogItemRequest_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX IF NOT EXISTS "CatalogItemRequest_storeId_status_idx"
  ON "CatalogItemRequest"("storeId", "status");
CREATE INDEX IF NOT EXISTS "CatalogItemRequest_status_createdAt_idx"
  ON "CatalogItemRequest"("status", "createdAt");

-- Foreign keys
DO $$ BEGIN
  ALTER TABLE "CatalogItemRequest"
    ADD CONSTRAINT "CatalogItemRequest_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "CatalogItemRequest"
    ADD CONSTRAINT "CatalogItemRequest_requestedBy_fkey"
    FOREIGN KEY ("requestedBy") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "CatalogItemRequest"
    ADD CONSTRAINT "CatalogItemRequest_catalogItemId_fkey"
    FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
