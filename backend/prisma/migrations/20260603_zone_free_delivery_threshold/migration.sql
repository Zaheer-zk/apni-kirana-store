-- Add per-zone free-delivery threshold (rupees). 0 = disabled.
-- Order-create math zeroes the deliveryFee when subtotal >= this value > 0.
ALTER TABLE "Zone"
  ADD COLUMN IF NOT EXISTS "freeDeliveryThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0;
