-- NotificationPreferences (per-user toggles) + WebPushSubscription (admin browser)

BEGIN;

CREATE TABLE "NotificationPreferences" (
  "id"                  TEXT NOT NULL,
  "userId"              TEXT NOT NULL,
  "orderUpdates"        BOOLEAN NOT NULL DEFAULT true,
  "promotional"         BOOLEAN NOT NULL DEFAULT true,
  "dailySummary"        BOOLEAN NOT NULL DEFAULT false,
  "driverUpdates"       BOOLEAN NOT NULL DEFAULT true,
  "newOrderAlerts"      BOOLEAN NOT NULL DEFAULT true,
  "rescindedAlerts"     BOOLEAN NOT NULL DEFAULT true,
  "earningsSummary"     BOOLEAN NOT NULL DEFAULT false,
  "newDeliveryAlerts"   BOOLEAN NOT NULL DEFAULT true,
  "payoutNotifications" BOOLEAN NOT NULL DEFAULT true,
  "newStoreApprovals"   BOOLEAN NOT NULL DEFAULT true,
  "newDriverApprovals"  BOOLEAN NOT NULL DEFAULT true,
  "refundEvents"        BOOLEAN NOT NULL DEFAULT true,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationPreferences_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NotificationPreferences_userId_key" ON "NotificationPreferences"("userId");

CREATE TABLE "WebPushSubscription" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "endpoint"  TEXT NOT NULL,
  "p256dh"    TEXT NOT NULL,
  "auth"      TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WebPushSubscription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WebPushSubscription_endpoint_key" ON "WebPushSubscription"("endpoint");
CREATE INDEX "WebPushSubscription_userId_idx" ON "WebPushSubscription"("userId");

COMMIT;
