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

import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createTestApp } from './helpers/app';
import { prisma } from '../src/config/prisma';
import { redis } from '../src/config/redis';
import { signRefreshToken } from '../src/utils/jwt';
import { loginAs, createUser, tokenFor } from './helpers/factory';

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

    const user = await prisma.user.findUnique({ where: { phone: valid.phone } });
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

    const dbUser = await prisma.user.findUnique({ where: { phone: '9844444444' } });
    expect(dbUser!.phoneVerified).toBe(true);
  });

  it('returns 404 when the phone is not registered (no auto-create)', async () => {
    await redis.set('otp:9000099999', '123456', 'EX', 300);
    const res = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ phone: '9000099999', otp: '123456' });

    expect(res.status).toBe(404);
    const dbUser = await prisma.user.findUnique({ where: { phone: '9000099999' } });
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

  it('returns 403 when logging in from the wrong app (role not granted)', async () => {
    await createUser({ phone: '9000022222', role: 'CUSTOMER', roles: ['CUSTOMER'] });
    await redis.set('otp:9000022222', '222222', 'EX', 300);

    const res = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ phone: '9000022222', otp: '222222', role: 'DRIVER' });
    expect(res.status).toBe(403);
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

  it('logs in with phone + password', async () => {
    await makeUser();
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: '9855555555', password: 'secret123' });
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

  it('returns 403 when the requested role is not granted', async () => {
    await makeUser();
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'loginuser', password: 'secret123', role: 'STORE_OWNER' });
    expect(res.status).toBe(403);
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
