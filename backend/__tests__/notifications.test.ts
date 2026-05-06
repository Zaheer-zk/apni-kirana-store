jest.mock('twilio', () =>
  jest.fn(() => ({ messages: { create: jest.fn().mockResolvedValue({}) } })),
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
import { loginAs } from './helpers/factory';

const app = createTestApp();

async function seedNotifications(userId: string, count: number) {
  for (let i = 0; i < count; i++) {
    await prisma.notification.create({
      data: { userId, title: `T${i}`, body: `B${i}` },
    });
    // tiny delay so createdAt orders deterministically
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe('GET /api/v1/notifications', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/v1/notifications');
    expect(res.status).toBe(401);
  });

  it('returns the user notifications, paginated, sorted desc', async () => {
    const { token, user } = await loginAs('CUSTOMER');
    await seedNotifications(user.id, 3);

    const res = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.notifications.length).toBe(3);
    // Most recent first
    expect(res.body.data.notifications[0].title).toBe('T2');
    expect(res.body.data.unreadCount).toBe(3);
  });

  it('does not leak other users notifications', async () => {
    const { token, user } = await loginAs('CUSTOMER');
    await seedNotifications(user.id, 1);
    const { user: other } = await loginAs('CUSTOMER');
    await seedNotifications(other.id, 2);

    const res = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.data.notifications.length).toBe(1);
  });
});

describe('PUT /api/v1/notifications/:id/read', () => {
  it('marks a single notification as read', async () => {
    const { token, user } = await loginAs('CUSTOMER');
    const n = await prisma.notification.create({
      data: { userId: user.id, title: 'X', body: 'Y' },
    });

    const res = await request(app)
      .put(`/api/v1/notifications/${n.id}/read`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.isRead).toBe(true);
  });

  it('returns 404 for another users notification', async () => {
    const { token } = await loginAs('CUSTOMER');
    const { user: other } = await loginAs('CUSTOMER');
    const n = await prisma.notification.create({
      data: { userId: other.id, title: 'X', body: 'Y' },
    });
    const res = await request(app)
      .put(`/api/v1/notifications/${n.id}/read`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/v1/notifications/read-all', () => {
  it('marks all unread notifications as read', async () => {
    const { token, user } = await loginAs('CUSTOMER');
    await seedNotifications(user.id, 4);

    const res = await request(app)
      .put('/api/v1/notifications/read-all')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBe(4);

    const remainingUnread = await prisma.notification.count({
      where: { userId: user.id, isRead: false },
    });
    expect(remainingUnread).toBe(0);
  });
});

describe('PUT /api/v1/notifications/fcm-token', () => {
  it('updates the user fcmToken', async () => {
    const { token, user } = await loginAs('CUSTOMER');
    const res = await request(app)
      .put('/api/v1/notifications/fcm-token')
      .set('Authorization', `Bearer ${token}`)
      .send({ token: 'fcm-abc-123' });
    expect(res.status).toBe(200);
    const reloaded = await prisma.user.findUnique({ where: { id: user.id } });
    expect(reloaded?.fcmToken).toBe('fcm-abc-123');
  });

  it('returns 400 when token missing', async () => {
    const { token } = await loginAs('CUSTOMER');
    const res = await request(app)
      .put('/api/v1/notifications/fcm-token')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('requires auth', async () => {
    const res = await request(app)
      .put('/api/v1/notifications/fcm-token')
      .send({ token: 'x' });
    expect(res.status).toBe(401);
  });
});
