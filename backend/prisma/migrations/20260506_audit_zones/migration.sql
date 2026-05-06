-- AuditLog (admin actions) + Zone (delivery configuration per city/area)

BEGIN;

CREATE TABLE "AuditLog" (
  "id"         TEXT NOT NULL,
  "actorId"    TEXT NOT NULL,
  "action"     TEXT NOT NULL,
  "targetType" TEXT,
  "targetId"   TEXT,
  "before"     JSONB,
  "after"      JSONB,
  "reason"     TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

CREATE TABLE "Zone" (
  "id"              TEXT NOT NULL,
  "name"            TEXT NOT NULL,
  "city"            TEXT NOT NULL,
  "centerLat"       DOUBLE PRECISION NOT NULL,
  "centerLng"       DOUBLE PRECISION NOT NULL,
  "radiusKm"        DOUBLE PRECISION NOT NULL DEFAULT 5,
  "baseDeliveryFee" DOUBLE PRECISION NOT NULL DEFAULT 30,
  "perKmFee"        DOUBLE PRECISION NOT NULL DEFAULT 0,
  "commissionRate"  DOUBLE PRECISION NOT NULL DEFAULT 0.10,
  "isActive"        BOOLEAN NOT NULL DEFAULT true,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Zone_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Zone_name_key" ON "Zone"("name");
CREATE INDEX "Zone_city_idx" ON "Zone"("city");
CREATE INDEX "Zone_isActive_idx" ON "Zone"("isActive");

COMMIT;
