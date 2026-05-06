-- Marketplace pivot: introduce CatalogItem (admin master) + StoreItem (per-store).
-- Existing Item rows are converted: each unique (name, category) becomes a
-- CatalogItem; each Item becomes a StoreItem pointing to its CatalogItem.
-- OrderItem.itemId is nulled (denormalized name/price/unit on OrderItem are kept).

BEGIN;

-- 1. New CatalogItem table
CREATE TABLE "CatalogItem" (
  "id"          TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "category"    "ItemCategory" NOT NULL,
  "defaultUnit" TEXT NOT NULL,
  "imageUrl"    TEXT,
  "isActive"    BOOLEAN NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CatalogItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CatalogItem_name_key" ON "CatalogItem"("name");
CREATE INDEX "CatalogItem_category_idx" ON "CatalogItem"("category");
CREATE INDEX "CatalogItem_name_idx" ON "CatalogItem"("name");

-- 2. New StoreItem table
CREATE TABLE "StoreItem" (
  "id"            TEXT NOT NULL,
  "storeId"       TEXT NOT NULL,
  "catalogItemId" TEXT NOT NULL,
  "price"         DOUBLE PRECISION NOT NULL,
  "stockQty"      INTEGER NOT NULL DEFAULT 0,
  "isAvailable"   BOOLEAN NOT NULL DEFAULT true,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StoreItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StoreItem_storeId_catalogItemId_key" ON "StoreItem"("storeId", "catalogItemId");
CREATE INDEX "StoreItem_storeId_idx" ON "StoreItem"("storeId");
CREATE INDEX "StoreItem_catalogItemId_idx" ON "StoreItem"("catalogItemId");

ALTER TABLE "StoreItem"
  ADD CONSTRAINT "StoreItem_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE;
ALTER TABLE "StoreItem"
  ADD CONSTRAINT "StoreItem_catalogItemId_fkey"
    FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id") ON DELETE CASCADE;

-- 3. Order.dropoffOtp column
ALTER TABLE "Order" ADD COLUMN "dropoffOtp" TEXT;

-- 4. Backfill: build CatalogItem from distinct (name, category) in Item.
INSERT INTO "CatalogItem" (id, name, category, "defaultUnit", "isActive", "createdAt", "updatedAt")
SELECT
  -- deterministic id: prefix + short hash of name (so reruns are idempotent for fresh dbs)
  'catalog_' || substr(md5(name), 1, 16) AS id,
  name,
  category,
  -- pick the most common unit per name
  (SELECT i2.unit FROM "Item" i2 WHERE i2.name = i.name GROUP BY i2.unit ORDER BY COUNT(*) DESC LIMIT 1) AS "defaultUnit",
  true,
  NOW(),
  NOW()
FROM (SELECT DISTINCT name, category FROM "Item") i
ON CONFLICT (name) DO NOTHING;

-- 5. Backfill: each existing Item → a StoreItem pointing at the catalog row
INSERT INTO "StoreItem" (id, "storeId", "catalogItemId", price, "stockQty", "isAvailable", "createdAt", "updatedAt")
SELECT
  'storeitem_' || i.id,
  i."storeId",
  c.id,
  i.price,
  i."stockQty",
  i."isAvailable",
  i."createdAt",
  i."updatedAt"
FROM "Item" i
JOIN "CatalogItem" c ON c.name = i.name
ON CONFLICT ("storeId", "catalogItemId") DO NOTHING;

-- 6. Detach OrderItem from old Item table (denormalized fields stay)
ALTER TABLE "OrderItem" DROP CONSTRAINT IF EXISTS "OrderItem_itemId_fkey";

-- 7. Drop old Item table
DROP TABLE "Item";

COMMIT;
