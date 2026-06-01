-- Order timestamps for the packed + cooking transitions. Idempotent;
-- both columns nullable and additive.

ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "packedAt"         TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cookingStartedAt" TIMESTAMP(3);
