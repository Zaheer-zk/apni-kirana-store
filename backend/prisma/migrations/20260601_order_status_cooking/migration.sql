-- Add COOKING status for restaurant/cloud-kitchen orders. Sits between
-- STORE_ACCEPTED and DRIVER_ASSIGNED. Idempotent.

ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'COOKING';
