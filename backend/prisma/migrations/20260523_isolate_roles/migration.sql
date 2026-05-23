-- Isolate per-role accounts: each (phone, role) is its own User row with its
-- own name/email/username/password. A phone can hold CUSTOMER + STORE_OWNER +
-- DRIVER simultaneously — but as separate rows, no shared profile data.

-- Drop the existing `phone` unique constraint; phone is no longer unique on
-- its own. The plain `@@index([phone])` stays for lookup speed.
DROP INDEX IF EXISTS "User_phone_key";

-- Collapse any existing multi-role rows back to a single role. After this
-- migration, additional roles are created as NEW rows by the register flow,
-- not appended to an existing row's `roles[]`.
UPDATE "User" SET "roles" = ARRAY["role"]::"UserRole"[];

-- (phone, role) is the new uniqueness boundary: one customer + one store
-- owner + one driver per phone, never two of the same role.
CREATE UNIQUE INDEX "User_phone_role_key" ON "User"("phone", "role");
