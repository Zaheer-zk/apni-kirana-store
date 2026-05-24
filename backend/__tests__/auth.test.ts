// Mock external IO before importing the app under test.
jest.mock('twilio', () =>
  jest.fn(() => ({
    messages: { create: jest.fn().mockResolvedValue({ sid: 'TEST_SID' }) },
  })),
);
jest.mock('../src/queues', () => ({
  matchingQueue: { add: jest.fn().mockResolvedValue(undefined) },
  driverQueue: { add: jest.fn().mockResolvedValue(undefined) },
  startWorkers: jest.fn(),
  stopWorkers: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/queues/queues', () => ({
  matchingQueue: { add: jest.fn().mockResolvedValue(undefined) },
  driverQueue: { add: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('../src/services/notification.service', () => ({
  sendNotification: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/services/email.service', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
}));

import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createTestApp } from './helpers/app';
import { prisma } from '../src/config/prisma';
import { redis } from '../src/config/redis';
import { signRefreshToken } from '../src/utils/jwt';
import { generateResetToken } from '../src/utils/token';
import { sendPasswordResetEmail } from '../src/services/email.service';
import { loginAs, createUser, tokenFor } from './helpers/factory';

const mockSendResetEmail = sendPasswordResetEmail as jest.Mock;

const app = createTestApp();

describe('POST /api/v1/auth/send-otp', () => {
  it('returns 200 and stores an OTP in Redis for valid 10-digit phone', async () => {
    const res = await request(app)
      .post('/api/v1/auth/send-otp')
      .send({ phone: '9876543210' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const stored = await redis.get('otp:9876543210');
    expect(stored).toMatch(/^\d{6}$/);
  });

  it('returns 400 for a 9-digit phone', async () => {
    const res = await request(app)
      .post('/api/v1/auth/send-otp')
      .send({ phone: '987654321' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 for a phone containing letters', async () => {
    const res = await request(app)
      .post('/api/v1/auth/send-otp')
      .send({ phone: '98abc54321' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/auth/register', () => {
  const valid = {
    name: 'New Customer',
    phone: '9811111111',
    email: 'new.customer@example.com',
    username: 'newcustomer',
    password: 'secret123',
    role: 'CUSTOMER' as const,
  };

  it('creates an unverified account and sends an OTP', async () => {
    const res = await request(app).post('/api/v1/auth/register').send(valid);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const user = await prisma.user.findFirst({ where: { phone: valid.phone } });
    expect(user).not.toBeNull();
    expect(user!.phoneVerified).toBe(false);
    expect(user!.roles).toEqual(['CUSTOMER']);
    expect(user!.passwordHash).toBeTruthy();
    expect(user!.passwordHash).not.toBe(valid.password); // hashed, not plaintext

    const otp = await redis.get(`otp:${valid.phone}`);
    expect(otp).toMatch(/^\d{6}$/);
  });

  it('returns 409 when the phone is already registered + verified with that role', async () => {
    await createUser({ phone: valid.phone, role: 'CUSTOMER', phoneVerified: true });
    const res = await request(app).post('/api/v1/auth/register').send(valid);
    expect(res.status).toBe(409);
  });

  it('returns 409 when the email is already in use', async () => {
    await createUser({ phone: '9822222222', email: valid.email });
    const res = await request(app).post('/api/v1/auth/register').send(valid);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/email/i);
  });

  it('returns 409 when the username is taken', async () => {
    await createUser({ phone: '9833333333', username: valid.username });
    const res = await request(app).post('/api/v1/auth/register').send(valid);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/username/i);
  });

  it('returns 400 for an invalid email', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...valid, email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for a password shorter than 8 characters', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...valid, password: 'short' });
    expect(res.status).toBe(400);
  });

  it('lets an existing account register an additional (different) role', async () => {
    await createUser({ phone: valid.phone, role: 'CUSTOMER', roles: ['CUSTOMER'] });
    // Different email/username — each (phone, role) is its own account.
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...valid, role: 'DRIVER', email: 'driver.role@example.com', username: 'driverrole' });

    expect(res.status).toBe(201);
    expect(await redis.get(`otp:${valid.phone}`)).toMatch(/^\d{6}$/);
    // Two separate rows on the same phone — one per role.
    const rows = await prisma.user.findMany({ where: { phone: valid.phone } });
    expect(rows.length).toBe(2);
    expect(rows.map((r) => r.role).sort()).toEqual(['CUSTOMER', 'DRIVER']);
  });
});

describe('POST /api/v1/auth/verify-otp', () => {
  it('completes registration: verifies the phone and returns tokens', async () => {
    await request(app).post('/api/v1/auth/register').send({
      name: 'Verify Me',
      phone: '9844444444',
      email: 'verify.me@example.com',
      username: 'verifyme',
      password: 'secret123',
      role: 'CUSTOMER',
    });
    const otp = await redis.get('otp:9844444444');

    const res = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ phone: '9844444444', otp, role: 'CUSTOMER' });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    expect(res.body.data.user.phone).toBe('9844444444');
    expect(res.body.data.user.passwordHash).toBeUndefined(); // never leak the hash

    const dbUser = await prisma.user.findFirst({ where: { phone: '9844444444' } });
    expect(dbUser!.phoneVerified).toBe(true);
  });

  it('returns 404 when the phone is not registered (no auto-create)', async () => {
    await redis.set('otp:9000099999', '123456', 'EX', 300);
    const res = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ phone: '9000099999', otp: '123456' });

    expect(res.status).toBe(404);
    const dbUser = await prisma.user.findFirst({ where: { phone: '9000099999' } });
    expect(dbUser).toBeNull();
  });

  it('returns 400 when OTP is wrong', async () => {
    await createUser({ phone: '9876543210' });
    await redis.set('otp:9876543210', '111111', 'EX', 300);
    const res = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ phone: '9876543210', otp: '999999' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when no OTP exists for a registered phone', async () => {
    await createUser({ phone: '9876543210' });
    const res = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ phone: '9876543210', otp: '123456' });
    expect(res.status).toBe(400);
  });

  it('returns 403 when user is suspended', async () => {
    await createUser({ phone: '9000011111', role: 'CUSTOMER', isActive: false });
    await redis.set('otp:9000011111', '654321', 'EX', 300);

    const res = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ phone: '9000011111', otp: '654321' });
    expect(res.status).toBe(403);
  });

  it('returns 404 when no account exists for that (phone, role)', async () => {
    // CUSTOMER row exists, but verify-otp is called for role DRIVER.
    await createUser({ phone: '9000022222', role: 'CUSTOMER', roles: ['CUSTOMER'] });
    await redis.set('otp:9000022222', '222222', 'EX', 300);

    const res = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ phone: '9000022222', otp: '222222', role: 'DRIVER' });
    expect(res.status).toBe(404);
  });

  it('verifies an additional-role registration into its own DRIVER row', async () => {
    await createUser({ phone: '9000033333', role: 'CUSTOMER', roles: ['CUSTOMER'] });
    // Register the DRIVER role on the existing number — creates a NEW row.
    await request(app).post('/api/v1/auth/register').send({
      name: 'Multi Role',
      phone: '9000033333',
      email: 'multi.role@example.com',
      username: 'multirole',
      password: 'secret123',
      role: 'DRIVER',
    });
    const otp = await redis.get('otp:9000033333');

    const res = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ phone: '9000033333', otp, role: 'DRIVER' });

    expect(res.status).toBe(200);
    // Two rows on the phone, one per role. The DRIVER row is now verified.
    const rows = await prisma.user.findMany({ where: { phone: '9000033333' } });
    expect(rows.length).toBe(2);
    const driverRow = rows.find((r) => r.role === 'DRIVER');
    expect(driverRow!.phoneVerified).toBe(true);
  });
});

describe('POST /api/v1/auth/login', () => {
  async function makeUser(overrides: Record<string, unknown> = {}) {
    return createUser({
      phone: '9855555555',
      username: 'loginuser',
      passwordHash: await bcrypt.hash('secret123', 10),
      role: 'CUSTOMER',
      roles: ['CUSTOMER'],
      phoneVerified: true,
      ...overrides,
    });
  }

  it('logs in with username + password', async () => {
    await makeUser();
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'loginuser', password: 'secret123', role: 'CUSTOMER' });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  it('logs in with phone + password (role is required for phone)', async () => {
    await makeUser();
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: '9855555555', password: 'secret123', role: 'CUSTOMER' });
    expect(res.status).toBe(200);
  });

  it('returns 401 for a wrong password', async () => {
    await makeUser();
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'loginuser', password: 'wrongpass' });
    expect(res.status).toBe(401);
  });

  it('returns 401 for an unknown user', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'nobody', password: 'secret123' });
    expect(res.status).toBe(401);
  });

  it('returns 403 for a suspended account', async () => {
    await makeUser({ isActive: false });
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'loginuser', password: 'secret123' });
    expect(res.status).toBe(403);
  });

  it('returns 403 when the phone is not yet verified', async () => {
    await makeUser({ phoneVerified: false });
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'loginuser', password: 'secret123' });
    expect(res.status).toBe(403);
  });

  it('returns 401 when no account exists for the requested role (per-role isolation)', async () => {
    // makeUser() seeds a CUSTOMER account; asking to log in as STORE_OWNER
    // should not leak that another role exists on the same username. Under
    // per-role isolation the lookup is (username, role) so the wrong role
    // looks identical to "no such user" — 401 generic.
    await makeUser();
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'loginuser', password: 'secret123', role: 'STORE_OWNER' });
    expect(res.status).toBe(401);
  });

  it('reports mustChangePassword for admin-created accounts', async () => {
    await makeUser({ mustChangePassword: true });
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'loginuser', password: 'secret123' });
    expect(res.status).toBe(200);
    expect(res.body.data.mustChangePassword).toBe(true);
  });
});

describe('POST /api/v1/auth/login-password', () => {
  async function makeUser(overrides: Record<string, unknown> = {}) {
    return createUser({
      phone: '9700000001',
      username: 'unifieduser',
      email: 'unified@example.com',
      passwordHash: await bcrypt.hash('secret123', 10),
      role: 'CUSTOMER',
      roles: ['CUSTOMER'],
      phoneVerified: true,
      ...overrides,
    });
  }

  it('logs in by username + correct password + role', async () => {
    await makeUser();
    const res = await request(app)
      .post('/api/v1/auth/login-password')
      .send({ identifier: 'unifieduser', password: 'secret123', role: 'CUSTOMER' });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    expect(res.body.data.user.username).toBe('unifieduser');
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  it('logs in by email + correct password + role', async () => {
    await makeUser();
    const res = await request(app)
      .post('/api/v1/auth/login-password')
      .send({ identifier: 'unified@example.com', password: 'secret123', role: 'CUSTOMER' });

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe('unified@example.com');
  });

  it('returns 401 for a wrong password', async () => {
    await makeUser();
    const res = await request(app)
      .post('/api/v1/auth/login-password')
      .send({ identifier: 'unifieduser', password: 'wrongpass', role: 'CUSTOMER' });
    expect(res.status).toBe(401);
  });

  it('returns 401 when the requested role doesn\'t exist for that identifier', async () => {
    // makeUser() seeds a CUSTOMER; asking for STORE_OWNER should look like
    // 'no such account' — not leak that another role exists.
    await makeUser();
    const res = await request(app)
      .post('/api/v1/auth/login-password')
      .send({ identifier: 'unifieduser', password: 'secret123', role: 'STORE_OWNER' });
    expect(res.status).toBe(401);
  });

  it('returns 400 when role is missing', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login-password')
      .send({ identifier: 'unifieduser', password: 'secret123' });
    expect(res.status).toBe(400);
  });

  it('returns 401 with a helpful hint when the account has no password set', async () => {
    // Phone+OTP-only signup — no passwordHash on record yet.
    await createUser({
      phone: '9700000002',
      username: 'nopwduser',
      passwordHash: undefined,
      role: 'CUSTOMER',
      roles: ['CUSTOMER'],
      phoneVerified: true,
    });
    const res = await request(app)
      .post('/api/v1/auth/login-password')
      .send({ identifier: 'nopwduser', password: 'anypassword', role: 'CUSTOMER' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/password is not set|OTP/i);
  });

  it('multi-role: same email under CUSTOMER + STORE_OWNER returns the right row per role', async () => {
    // Both rows share an email — that's the whole point of per-role uniqueness.
    const sharedEmail = 'multi@example.com';
    const customer = await createUser({
      phone: '9700001111',
      email: sharedEmail,
      username: 'multicus',
      passwordHash: await bcrypt.hash('cuspass1', 10),
      role: 'CUSTOMER',
      roles: ['CUSTOMER'],
      phoneVerified: true,
    });
    const owner = await createUser({
      phone: '9700002222',
      email: sharedEmail,
      username: 'multiowner',
      passwordHash: await bcrypt.hash('ownpass1', 10),
      role: 'STORE_OWNER',
      roles: ['STORE_OWNER'],
      phoneVerified: true,
    });

    const cusRes = await request(app)
      .post('/api/v1/auth/login-password')
      .send({ identifier: sharedEmail, password: 'cuspass1', role: 'CUSTOMER' });
    expect(cusRes.status).toBe(200);
    expect(cusRes.body.data.user.id).toBe(customer.id);
    expect(cusRes.body.data.user.role).toBe('CUSTOMER');

    const ownerRes = await request(app)
      .post('/api/v1/auth/login-password')
      .send({ identifier: sharedEmail, password: 'ownpass1', role: 'STORE_OWNER' });
    expect(ownerRes.status).toBe(200);
    expect(ownerRes.body.data.user.id).toBe(owner.id);
    expect(ownerRes.body.data.user.role).toBe('STORE_OWNER');

    // Wrong password against the OTHER role on the same email — 401.
    const xRes = await request(app)
      .post('/api/v1/auth/login-password')
      .send({ identifier: sharedEmail, password: 'cuspass1', role: 'STORE_OWNER' });
    expect(xRes.status).toBe(401);
  });

  it('returns pendingApproval=true with reason=STORE_PENDING for a pending store owner', async () => {
    const owner = await createUser({
      phone: '9700003333',
      username: 'pendingowner',
      passwordHash: await bcrypt.hash('secret123', 10),
      role: 'STORE_OWNER',
      roles: ['STORE_OWNER'],
      phoneVerified: true,
    });
    // Pending store linked to this owner.
    await prisma.store.create({
      data: {
        ownerId: owner.id,
        name: 'Pending Mart',
        category: 'GROCERY',
        lat: 28.6,
        lng: 77.2,
        street: '1 St',
        city: 'Delhi',
        state: 'DL',
        pincode: '110001',
        openTime: '09:00',
        closeTime: '21:00',
        status: 'PENDING_APPROVAL',
      },
    });

    const res = await request(app)
      .post('/api/v1/auth/login-password')
      .send({ identifier: 'pendingowner', password: 'secret123', role: 'STORE_OWNER' });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.pendingApproval).toBe(true);
    expect(res.body.data.reason).toBe('STORE_PENDING');
  });

  it('returns pendingApproval=true with reason=DRIVER_PENDING for a pending driver', async () => {
    const driverUser = await createUser({
      phone: '9700004444',
      username: 'pendingdriver',
      passwordHash: await bcrypt.hash('secret123', 10),
      role: 'DRIVER',
      roles: ['DRIVER'],
      phoneVerified: true,
    });
    await prisma.driver.create({
      data: {
        userId: driverUser.id,
        vehicleType: 'BIKE',
        vehicleNumber: 'DL01AA0001',
        licenseNumber: 'LIC-1',
        status: 'PENDING_APPROVAL',
      },
    });

    const res = await request(app)
      .post('/api/v1/auth/login-password')
      .send({ identifier: 'pendingdriver', password: 'secret123', role: 'DRIVER' });

    expect(res.status).toBe(200);
    expect(res.body.data.pendingApproval).toBe(true);
    expect(res.body.data.reason).toBe('DRIVER_PENDING');
  });

  it('omits pendingApproval once the store is ACTIVE', async () => {
    const owner = await createUser({
      phone: '9700005555',
      username: 'activeowner',
      passwordHash: await bcrypt.hash('secret123', 10),
      role: 'STORE_OWNER',
      roles: ['STORE_OWNER'],
      phoneVerified: true,
    });
    await prisma.store.create({
      data: {
        ownerId: owner.id,
        name: 'Active Mart',
        category: 'GROCERY',
        lat: 28.6,
        lng: 77.2,
        street: '2 St',
        city: 'Delhi',
        state: 'DL',
        pincode: '110001',
        openTime: '09:00',
        closeTime: '21:00',
        status: 'ACTIVE',
      },
    });

    const res = await request(app)
      .post('/api/v1/auth/login-password')
      .send({ identifier: 'activeowner', password: 'secret123', role: 'STORE_OWNER' });
    expect(res.status).toBe(200);
    expect(res.body.data.pendingApproval).toBeUndefined();
  });
});

describe('POST /api/v1/auth/register — optional fields', () => {
  it('accepts a phone-only registration (no email / username / password)', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      name: 'Phone Only',
      phone: '9711111111',
      role: 'CUSTOMER',
    });

    expect(res.status).toBe(201);
    const user = await prisma.user.findFirst({ where: { phone: '9711111111' } });
    expect(user).not.toBeNull();
    expect(user!.email).toBeNull();
    expect(user!.username).toBeNull();
    expect(user!.passwordHash).toBeNull();
  });

  it('allows the same email across two different roles', async () => {
    const email = 'cross.role@example.com';

    const a = await request(app).post('/api/v1/auth/register').send({
      name: 'A',
      phone: '9722222222',
      email,
      role: 'CUSTOMER',
    });
    expect(a.status).toBe(201);

    const b = await request(app).post('/api/v1/auth/register').send({
      name: 'B',
      phone: '9733333333',
      email,
      role: 'STORE_OWNER',
    });
    expect(b.status).toBe(201);

    const rows = await prisma.user.findMany({ where: { email } });
    expect(rows.length).toBe(2);
    expect(rows.map((r) => r.role).sort()).toEqual(['CUSTOMER', 'STORE_OWNER']);
  });

  it('blocks the same email being reused on the SAME role', async () => {
    const email = 'same.role@example.com';
    await createUser({ phone: '9744444444', email, role: 'CUSTOMER' });

    const res = await request(app).post('/api/v1/auth/register').send({
      name: 'Dup',
      phone: '9755555555',
      email,
      role: 'CUSTOMER',
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/email/i);
  });
});

describe('POST /api/v1/auth/change-password', () => {
  it('changes the password, clears mustChangePassword, and revokes sessions', async () => {
    const passwordHash = await bcrypt.hash('oldpass123', 10);
    const user = await createUser({
      phone: '9866666666',
      passwordHash,
      mustChangePassword: true,
    });
    const token = tokenFor(user);
    await prisma.refreshToken.create({
      data: {
        token: signRefreshToken({ id: user.id }),
        userId: user.id,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'oldpass123', newPassword: 'brandnew123' });

    expect(res.status).toBe(200);
    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updated!.mustChangePassword).toBe(false);
    expect(await bcrypt.compare('brandnew123', updated!.passwordHash!)).toBe(true);
    expect(await prisma.refreshToken.count({ where: { userId: user.id } })).toBe(0);
  });

  it('returns 401 for a wrong current password', async () => {
    const passwordHash = await bcrypt.hash('oldpass123', 10);
    const user = await createUser({ phone: '9877777777', passwordHash });
    const token = tokenFor(user);

    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'wrongpass', newPassword: 'brandnew123' });
    expect(res.status).toBe(401);
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .send({ currentPassword: 'x', newPassword: 'brandnew123' });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/auth/forgot-password', () => {
  beforeEach(() => mockSendResetEmail.mockClear());

  it('creates a reset token and emails a link for a known account', async () => {
    const user = await createUser({ phone: '9888888881', email: 'reset.me@example.com' });

    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'reset.me@example.com' });

    expect(res.status).toBe(200);
    expect(mockSendResetEmail).toHaveBeenCalledTimes(1);
    const tokens = await prisma.passwordResetToken.count({ where: { userId: user.id } });
    expect(tokens).toBe(1);
  });

  it('returns the same generic response for an unknown email (no enumeration)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'nobody@example.com' });

    expect(res.status).toBe(200);
    expect(mockSendResetEmail).not.toHaveBeenCalled();
  });

  it('keeps only one live reset token per user', async () => {
    const user = await createUser({ phone: '9888888882', email: 'twice@example.com' });
    await request(app).post('/api/v1/auth/forgot-password').send({ email: 'twice@example.com' });
    await request(app).post('/api/v1/auth/forgot-password').send({ email: 'twice@example.com' });

    const live = await prisma.passwordResetToken.count({
      where: { userId: user.id, usedAt: null },
    });
    expect(live).toBe(1);
  });
});

describe('POST /api/v1/auth/reset-password', () => {
  beforeEach(() => mockSendResetEmail.mockClear());

  it('resets the password, consumes the token, and revokes sessions', async () => {
    const user = await createUser({ phone: '9888888883', email: 'do.reset@example.com' });
    await prisma.refreshToken.create({
      data: {
        token: signRefreshToken({ id: user.id }),
        userId: user.id,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'do.reset@example.com' });
    // The reset link (with the raw token) is the 3rd arg passed to the email.
    const link = mockSendResetEmail.mock.calls[0][2] as string;
    const token = new URL(link).searchParams.get('token');

    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token, newPassword: 'freshpass123' });

    expect(res.status).toBe(200);
    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    expect(await bcrypt.compare('freshpass123', updated!.passwordHash!)).toBe(true);
    expect(await prisma.refreshToken.count({ where: { userId: user.id } })).toBe(0);

    // The token is single-use — a second attempt fails.
    const second = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token, newPassword: 'anotherone123' });
    expect(second.status).toBe(400);
  });

  it('returns 400 for an unknown token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'deadbeef'.repeat(8), newPassword: 'freshpass123' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for an expired token', async () => {
    const user = await createUser({ phone: '9888888884', email: 'expired@example.com' });
    const { raw, hash } = generateResetToken();
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hash,
        expiresAt: new Date(Date.now() - 1000), // already expired
      },
    });
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: raw, newPassword: 'freshpass123' });
    expect(res.status).toBe(400);
  });

  it('validate endpoint reports token validity', async () => {
    const user = await createUser({ phone: '9888888885', email: 'validate@example.com' });
    const { raw, hash } = generateResetToken();
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hash, expiresAt: new Date(Date.now() + 60_000) },
    });

    const good = await request(app).get(`/api/v1/auth/reset-password/validate?token=${raw}`);
    expect(good.status).toBe(200);
    expect(good.body.data.valid).toBe(true);

    const bad = await request(app).get('/api/v1/auth/reset-password/validate?token=nope');
    expect(bad.body.data.valid).toBe(false);
  });
});

describe('POST /api/v1/auth/refresh', () => {
  it('issues a new access token for a valid refresh token', async () => {
    const { user } = await loginAs('CUSTOMER');
    const refreshToken = signRefreshToken({ id: user.id });
    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
  });

  it('returns 401 for a syntactically invalid refresh token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'not.a.real.jwt' });
    expect(res.status).toBe(401);
  });

  it('returns 401 when refresh token is not in the database', async () => {
    const { user } = await loginAs('CUSTOMER');
    const refreshToken = signRefreshToken({ id: user.id });
    // do not insert into DB
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('returns 200 and removes refresh tokens for the authenticated user', async () => {
    const { user, token } = await loginAs('CUSTOMER');
    const refreshToken = signRefreshToken({ id: user.id });
    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 1000 * 60),
      },
    });

    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(200);
    const remaining = await prisma.refreshToken.count({ where: { userId: user.id } });
    expect(remaining).toBe(0);
  });

  it('returns 401 when no auth header is provided', async () => {
    const res = await request(app).post('/api/v1/auth/logout').send({});
    expect(res.status).toBe(401);
  });
});
