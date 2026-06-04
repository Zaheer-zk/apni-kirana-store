-- Extend VehicleType enum so drivers without a powered vehicle (pedal
-- bicycle, walking) can be onboarded. The ETA engine uses these to set
-- per-driver leg speed when computing pickup + delivery time.
-- ALTER TYPE ... ADD VALUE IF NOT EXISTS is non-destructive — safe to
-- re-run on a DB that's already been updated.
ALTER TYPE "VehicleType" ADD VALUE IF NOT EXISTS 'BICYCLE';
ALTER TYPE "VehicleType" ADD VALUE IF NOT EXISTS 'ON_FOOT';
