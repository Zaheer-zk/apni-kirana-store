import { UserRole } from '@prisma/client';
import { prisma } from '../config/prisma';

/**
 * Grants `role` to a user — adds it to `User.roles` if not already present.
 * One phone number / account can hold CUSTOMER + STORE_OWNER + DRIVER at once,
 * so this never removes an existing role. `User.role` (the primary role) is
 * left untouched. Safe to call when the user already has the role.
 */
export async function grantRole(userId: string, role: UserRole): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { roles: true },
  });
  if (!user || user.roles.includes(role)) return;
  await prisma.user.update({
    where: { id: userId },
    data: { roles: { push: role } },
  });
}

/**
 * Strips secret fields before a user object is returned in an API response.
 */
export function publicUser<T extends { passwordHash?: string | null }>(
  user: T,
): Omit<T, 'passwordHash'> {
  const { passwordHash: _omit, ...rest } = user;
  return rest;
}
