-- CreateTable
CREATE TABLE "PlatformSetting" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "baseDeliveryFee" DOUBLE PRECISION NOT NULL DEFAULT 30,
    "perKmFee" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "commissionPercent" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "deliveryRadiusKm" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "storeAcceptTimeoutMinutes" INTEGER NOT NULL DEFAULT 3,
    "driverAcceptTimeoutSeconds" INTEGER NOT NULL DEFAULT 60,
    "storeMatchingMode" TEXT NOT NULL DEFAULT 'BROADCAST',
    "driverMatchingMode" TEXT NOT NULL DEFAULT 'BROADCAST',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("id")
);

-- Seed the singleton row so getSettings() never returns null on first read.
INSERT INTO "PlatformSetting" ("id", "updatedAt") VALUES ('default', NOW())
ON CONFLICT ("id") DO NOTHING;
