-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Device_token_key" ON "Device"("token");

-- CreateIndex
CREATE INDEX "Device_userId_idx" ON "Device"("userId");

-- Migrate existing User.fcmToken values into Device so no one loses pushes.
-- ID is just unique per row; cuid-shape isn't required.
INSERT INTO "Device" ("id", "userId", "token", "createdAt", "lastSeenAt")
SELECT
  'mig_' || md5(random()::text || clock_timestamp()::text || "id"),
  "id",
  "fcmToken",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User"
WHERE "fcmToken" IS NOT NULL
ON CONFLICT ("token") DO NOTHING;
