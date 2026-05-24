/**
 * Creates (or resets) an ADMIN account that logs in with username + password.
 *
 *   dev:  npx tsx src/scripts/create-admin.ts <username> <password> [phone]
 *   prod: docker compose ... exec backend node dist/scripts/create-admin.js <username> <password> [phone]
 *
 * If the username already exists its password is reset. `phone` is optional —
 * admins don't use OTP, so a placeholder is generated when omitted.
 */
import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma';

async function main(): Promise<void> {
  const [username, password, phone] = process.argv.slice(2);

  if (!username || !password) {
    console.error('Usage: create-admin <username> <password> [phone]');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  // Username is unique per (username, role) — upsert against the composite key.
  const user = await prisma.user.upsert({
    where: { username_role: { username, role: 'ADMIN' } },
    update: { passwordHash, role: 'ADMIN', roles: ['ADMIN'], isActive: true },
    create: {
      username,
      passwordHash,
      role: 'ADMIN',
      roles: ['ADMIN'],
      isActive: true,
      phoneVerified: true, // admins log in by username/password, not OTP
      name: 'Admin',
      phone: phone || `admin_${username}`,
    },
  });

  console.log(`Admin ready — log in with username "${user.username}".`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Failed to create admin:', err);
  await prisma.$disconnect();
  process.exit(1);
});
