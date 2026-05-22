-- Super admin: an ADMIN that can also create/manage other ADMIN accounts.
-- Exactly one account holds the flag; it is never assignable via the API.

ALTER TABLE "User" ADD COLUMN "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false;

-- Designate the founding account as the super admin.
UPDATE "User" SET "isSuperAdmin" = true WHERE "username" = 'zaheerzk';
