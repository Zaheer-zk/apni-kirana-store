-- Extend Notification with dispatch metadata (channel/status/event/error)
-- so the admin can audit every push/in-app/web-push attempt and see failures.
--
-- Defaults are chosen so existing rows backfill cleanly: legacy rows are
-- treated as in-app, delivered, with no captured event tag.

CREATE TYPE "NotificationChannel" AS ENUM (
  'INAPP',
  'PUSH',
  'WEBPUSH',
  'SOCKET',
  'EMAIL',
  'SMS'
);

CREATE TYPE "NotificationStatus" AS ENUM (
  'PENDING',
  'DELIVERED',
  'FAILED'
);

ALTER TABLE "Notification"
  ADD COLUMN "event"   TEXT,
  ADD COLUMN "channel" "NotificationChannel" NOT NULL DEFAULT 'INAPP',
  ADD COLUMN "status"  "NotificationStatus"  NOT NULL DEFAULT 'DELIVERED',
  ADD COLUMN "error"   TEXT;

CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
CREATE INDEX "Notification_event_idx"            ON "Notification"("event");
CREATE INDEX "Notification_channel_idx"          ON "Notification"("channel");
CREATE INDEX "Notification_status_idx"           ON "Notification"("status");
