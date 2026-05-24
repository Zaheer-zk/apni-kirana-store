-- Add ELECTRONICS to the ItemCategory enum. Postgres-only syntax.
-- Safe and online (no table rewrite).
ALTER TYPE "ItemCategory" ADD VALUE IF NOT EXISTS 'ELECTRONICS';
