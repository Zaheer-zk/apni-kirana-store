-- Phase 1 auth system: multi-role accounts, email, registration verification.

-- New User columns
ALTER TABLE "User" ADD COLUMN "email" TEXT;
ALTER TABLE "User" ADD COLUMN "roles" "UserRole"[] DEFAULT ARRAY[]::"UserRole"[];
ALTER TABLE "User" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "phoneVerified" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: every existing user keeps their single role in the roles set, and
-- is treated as already phone-verified (they are live accounts).
UPDATE "User" SET "roles" = ARRAY["role"]::"UserRole"[];
UPDATE "User" SET "phoneVerified" = true;

-- Unique email (partial — NULLs allowed, only non-null emails must be unique)
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- Password-reset tokens
CREATE TABLE "PasswordResetToken" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt"    TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

ALTER TABLE "PasswordResetToken"
  ADD CONSTRAINT "PasswordResetToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
