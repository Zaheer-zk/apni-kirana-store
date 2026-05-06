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
import { createStoreOwner, createItem, loginAs, tokenFor } from './helpers/factory';

const app = createTestApp();

const validStorePayload = {
  name: 'Fresh Mart',
  description: 'Best in town',
  category: 'GROCERY' as const,
  lat: 28.6139,
  lng: 77.209,
  street: '12 Park St',
  city: 'Delhi',
  state: 'DL',
  pincode: '110001',
  openTime: '08:00',
  closeTime: '22:00',
};

describe('POST /api/v1/stores/register', () => {
  it('creates a store in PENDING_APPROVAL and promotes user to STORE_OWNER', async () => {
    const { token, user } = await loginAs('CUSTOMER');
    const res = await request(app)
      .post('/api/v1/stores/register')
      .set('Authorization', `Bearer ${token}`)
      .send(validStorePayload);

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('PENDING_APPROVAL');

    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(dbUser?.role).toBe('STORE_OWNER');
  });

  it('returns 401 when no auth token is provided', async () => {
    const res = await request(app).post('/api/v1/stores/register').send(validStorePayload);
    expect(res.status).toBe(401);
  });

  it('returns 409 when user already owns a store', async () => {
    const { user } = await createStoreOwner();
    const token = tokenFor({ id: user.id, role: 'STORE_OWNER', phone: user.phone });
    const res = await request(app)
      .post('/api/v1/stores/register')
      .set('Authorization', `Bearer ${token}`)
      .send(validStorePayload);
    expect(res.status).toBe(409);
  });
});

describe('GET /api/v1/stores/nearby', () => {
  it('returns active+open stores within radius, sorted by distance', async () => {
    await createStoreOwner({ lat: 28.6139, lng: 77.209 }); // ~0 km
    await createStoreOwner({ lat: 28.62, lng: 77.215 }); // ~1 km

    const res = await request(app)
      .get('/api/v1/stores/nearby')
      .query({ lat: 28.6139, lng: 77.209, radius: 5 });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(2);
    expect(res.body.data[0].distanceKm).toBeLessThanOrEqual(res.body.data[1].distanceKm);
  });

  it('filters by category', async () => {
    await createStoreOwner({ category: 'GROCERY' });
    await createStoreOwner({ category: 'PHARMACY' });

    const res = await request(app)
      .get('/api/v1/stores/nearby')
      .query({ lat: 28.6139, lng: 77.209, radius: 5, category: 'PHARMACY' });

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].category).toBe('PHARMACY');
  });

  it('returns empty list when no stores exist', async () => {
    const res = await request(app)
      .get('/api/v1/stores/nearby')
      .query({ lat: 28.6139, lng: 77.209 });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('returns 400 when lat/lng missing', async () => {
    const res = await request(app).get('/api/v1/stores/nearby');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/stores/:id', () => {
  it('returns store with items _count', async () => {
    const { store } = await createStoreOwner();
    await createItem(store.id);

    const res = await request(app).get(`/api/v1/stores/${store.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(store.id);
    expect(res.body.data._count.items).toBe(1);
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app).get('/api/v1/stores/clz0000000000000000000000');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/stores/:id/items', () => {
  it('returns paginated items', async () => {
    const { store } = await createStoreOwner();
    for (let i = 0; i < 3; i++) {
      await createItem(store.id, { name: `Item ${i}` });
    }
    const res = await request(app)
      .get(`/api/v1/stores/${store.id}/items`)
      .query({ page: 1, limit: 2 });

    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBe(2);
    expect(res.body.data.total).toBe(3);
    expect(res.body.data.pages).toBe(2);
  });
});

describe('PUT /api/v1/stores/:id', () => {
  it('owner can update their own store', async () => {
    const { user, store } = await createStoreOwner();
    const token = tokenFor({ id: user.id, role: 'STORE_OWNER', phone: user.phone });
    const res = await request(app)
      .put(`/api/v1/stores/${store.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Renamed Store' });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Renamed Store');
  });

  it('non-owner store-owner gets 403', async () => {
    const { store } = await createStoreOwner();
    const { user: other } = await createStoreOwner();
    const otherToken = tokenFor({ id: other.id, role: 'STORE_OWNER', phone: other.phone });

    const res = await request(app)
      .put(`/api/v1/stores/${store.id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ name: 'Hacked' });

    expect(res.status).toBe(403);
  });

  it('customer gets 403', async () => {
    const { store } = await createStoreOwner();
    const { token } = await loginAs('CUSTOMER');
    const res = await request(app)
      .put(`/api/v1/stores/${store.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'X' });
    expect(res.status).toBe(403);
  });
});

describe('PUT /api/v1/stores/:id/toggle-open', () => {
  it('owner toggles isOpen flag', async () => {
    const { user, store } = await createStoreOwner({ isOpen: true });
    const token = tokenFor({ id: user.id, role: 'STORE_OWNER', phone: user.phone });

    const res = await request(app)
      .put(`/api/v1/stores/${store.id}/toggle-open`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.isOpen).toBe(false);
  });

  it('non-owner gets 403', async () => {
    const { store } = await createStoreOwner();
    const { user: other } = await createStoreOwner();
    const token = tokenFor({ id: other.id, role: 'STORE_OWNER', phone: other.phone });

    const res = await request(app)
      .put(`/api/v1/stores/${store.id}/toggle-open`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});
