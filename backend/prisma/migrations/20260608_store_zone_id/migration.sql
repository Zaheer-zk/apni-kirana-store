-- Store.zoneId — explicit zone the store belongs to. Nullable so the
-- migration is back-compat with existing stores (the matching engine
-- falls back to the lat/lng geographic filter for null zoneId).
-- Driver→Zone is many-to-many (DriverZone); Store→Zone is one-to-one
-- here because a store has ONE physical address.

ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "zoneId" TEXT;

CREATE INDEX IF NOT EXISTS "Store_zoneId_idx" ON "Store"("zoneId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Store_zoneId_fkey'
  ) THEN
    ALTER TABLE "Store"
      ADD CONSTRAINT "Store_zoneId_fkey"
      FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE SET NULL;
  END IF;
END $$;
