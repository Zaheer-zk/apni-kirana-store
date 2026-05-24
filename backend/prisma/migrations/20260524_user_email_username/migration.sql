-- Per-role uniqueness for email + username, mirroring (phone, role).
--
-- Today email + username are globally unique. After this migration the same
-- email / username value MAY appear on multiple User rows so long as each
-- row has a different role — i.e. one human can be both
-- (alice@x.com, CUSTOMER) and (alice@x.com, STORE_OWNER) as two isolated
-- accounts.
--
-- This is the email/username counterpart to 20260523_isolate_roles, which
-- already moved phone from globally-unique to `(phone, role)`-unique.
--
-- Also: phone becomes NULLABLE at the schema level (every registration still
-- requires it; this just unblocks future email-only signups).
--
-- Data-preserving: only DROPs/ADDs indexes + relaxes a NOT NULL constraint.
-- No rows are deleted or rewritten.

-- Drop the existing global unique indexes on email + username.
DROP INDEX IF EXISTS "User_email_key";
DROP INDEX IF EXISTS "User_username_key";

-- Make phone nullable. Existing rows are unaffected (they all have a phone).
ALTER TABLE "User" ALTER COLUMN "phone" DROP NOT NULL;

-- Composite uniques: same value across DIFFERENT roles is allowed, but only
-- one row per (value, role). Partial-indexed on NOT NULL so rows where the
-- column isn't set don't all collide as duplicate (NULL, role) tuples.
-- The index names match what Prisma would generate for @@unique([X, role])
-- so `prisma migrate dev` introspection passes cleanly.
CREATE UNIQUE INDEX "User_email_role_key"
  ON "User"("email", "role")
  WHERE "email" IS NOT NULL;

CREATE UNIQUE INDEX "User_username_role_key"
  ON "User"("username", "role")
  WHERE "username" IS NOT NULL;

-- Plain lookup indexes (paired with @@index in the schema) so finding by
-- email or username alone is still fast.
CREATE INDEX "User_email_idx" ON "User"("email");
CREATE INDEX "User_username_idx" ON "User"("username");
