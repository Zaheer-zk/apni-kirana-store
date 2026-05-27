-- Many-to-many between Driver and Zone — a driver can serve multiple zones,
-- a zone can be served by multiple drivers. Composite PK prevents
-- duplicate (driver, zone) rows.

CREATE TABLE "DriverZone" (
  "driverId"  TEXT         NOT NULL,
  "zoneId"    TEXT         NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DriverZone_pkey" PRIMARY KEY ("driverId", "zoneId")
);

CREATE INDEX "DriverZone_zoneId_idx" ON "DriverZone"("zoneId");

ALTER TABLE "DriverZone"
  ADD CONSTRAINT "DriverZone_driverId_fkey"
  FOREIGN KEY ("driverId") REFERENCES "Driver"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DriverZone"
  ADD CONSTRAINT "DriverZone_zoneId_fkey"
  FOREIGN KEY ("zoneId") REFERENCES "Zone"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
