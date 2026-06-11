-- Customer favorites / wishlist. One row per (customer, catalog product).
-- Keyed on CatalogItem (not StoreItem) so a favorite survives a store going
-- out of stock — the list re-resolves the best nearby store at read time.
-- Idempotent: safe to re-run on an already-migrated database.

-- CreateTable
CREATE TABLE IF NOT EXISTS "Favorite" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "catalogItemId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "Favorite_userId_catalogItemId_key"
  ON "Favorite"("userId", "catalogItemId");
CREATE INDEX IF NOT EXISTS "Favorite_userId_idx" ON "Favorite"("userId");
CREATE INDEX IF NOT EXISTS "Favorite_catalogItemId_idx" ON "Favorite"("catalogItemId");

-- Foreign keys
DO $$ BEGIN
  ALTER TABLE "Favorite"
    ADD CONSTRAINT "Favorite_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "Favorite"
    ADD CONSTRAINT "Favorite_catalogItemId_fkey"
    FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
