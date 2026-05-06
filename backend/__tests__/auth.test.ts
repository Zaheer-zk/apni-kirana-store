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
import { createTestApp } from './helpers/app';
import { prisma } from '../src/config/prisma';
import { redis } from '../src/config/redis';
import { signRefreshToken } from '../src/utils/jwt';
import { loginAs } from './helpers/factory';

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

describe('POST /api/v1/auth/verify-otp', () => {
  it('returns 200, tokens, and user when OTP matches; creates CUSTOMER on first login', async () => {
    await redis.set('otp:9876543210', '123456', 'EX', 300);

    const res = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ phone: '9876543210', otp: '123456' });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    expect(res.body.data.user.phone).toBe('9876543210');
    expect(res.body.data.user.role).toBe('CUSTOMER');

    const dbUser = await prisma.user.findUnique({ where: { phone: '9876543210' } });
    expect(dbUser).not.toBeNull();
  });

  it('returns 400 when OTP is wrong', async () => {
    await redis.set('otp:9876543210', '111111', 'EX', 300);
    const res = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ phone: '9876543210', otp: '999999' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when no OTP exists for phone', async () => {
    const res = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ phone: '9000099999', otp: '123456' });
    expect(res.status).toBe(400);
  });

  it('returns 403 when user is suspended', async () => {
    await prisma.user.create({
      data: { phone: '9000011111', role: 'CUSTOMER', isActive: false },
    });
    await redis.set('otp:9000011111', '654321', 'EX', 300);

    const res = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ phone: '9000011111', otp: '654321' });
    expect(res.status).toBe(403);
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
