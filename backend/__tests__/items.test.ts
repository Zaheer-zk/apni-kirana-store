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

describe('GET /api/v1/items/search', () => {
  it('returns items matching the query (case-insensitive)', async () => {
    const { store } = await createStoreOwner();
    await createItem(store.id, { name: 'Tomato Ketchup' });
    await createItem(store.id, { name: 'Apple Juice' });

    const res = await request(app)
      .get('/api/v1/items/search')
      .query({ q: 'tomato' });

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    // After the marketplace pivot the response is a StoreItem joined to CatalogItem
    expect(res.body.data[0].catalogItem.name).toBe('Tomato Ketchup');
  });

  it('filters by category', async () => {
    const { store } = await createStoreOwner();
    await createItem(store.id, { name: 'Aspirin', category: 'MEDICINE' });
    await createItem(store.id, { name: 'Aspirin Snack', category: 'SNACKS' });

    const res = await request(app)
      .get('/api/v1/items/search')
      .query({ q: 'aspirin', category: 'MEDICINE' });

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].catalogItem.category).toBe('MEDICINE');
  });

  it('returns empty list when q is missing or empty', async () => {
    // The new search endpoint accepts an empty q (returns latest items) — drop the 400 check.
    const res = await request(app).get('/api/v1/items/search');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('POST /api/v1/items', () => {
  it('store owner can add a catalog item to their store', async () => {
    const { user, store } = await createStoreOwner();
    const token = tokenFor({ id: user.id, role: 'STORE_OWNER', phone: user.phone });

    // Pivot: items are now references to a CatalogItem. Admin owns the catalog;
    // store owner picks one and sets price + stock.
    const catalog = await prisma.catalogItem.create({
      data: { name: 'Bread', category: 'GROCERY', defaultUnit: '1 loaf' },
    });

    const res = await request(app)
      .post('/api/v1/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ catalogItemId: catalog.id, price: 40, stockQty: 25 });

    expect(res.status).toBe(201);
    expect(res.body.data.catalogItem.name).toBe('Bread');
    expect(res.body.data.storeId).toBe(store.id);
  });

  it('customer (non-owner) gets 403', async () => {
    const { token } = await loginAs('CUSTOMER');
    const res = await request(app)
      .post('/api/v1/items')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Bread',
        category: 'GROCERY',
        price: 40,
        unit: '1 loaf',
        stockQty: 25,
      });
    expect(res.status).toBe(403);
  });

  it('returns 400 for invalid payload', async () => {
    const { user } = await createStoreOwner();
    const token = tokenFor({ id: user.id, role: 'STORE_OWNER', phone: user.phone });
    const res = await request(app)
      .post('/api/v1/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '', category: 'GROCERY', price: -1, unit: '' });
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/v1/items/:id', () => {
  it('owner can update their item', async () => {
    const { user, store } = await createStoreOwner();
    const token = tokenFor({ id: user.id, role: 'STORE_OWNER', phone: user.phone });
    const item = await createItem(store.id);

    const res = await request(app)
      .put(`/api/v1/items/${item.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ price: 250 });

    expect(res.status).toBe(200);
    expect(res.body.data.price).toBe(250);
  });

  it('non-owner gets 403', async () => {
    const { store } = await createStoreOwner();
    const item = await createItem(store.id);
    const { user: other } = await createStoreOwner();
    const otherToken = tokenFor({ id: other.id, role: 'STORE_OWNER', phone: other.phone });

    const res = await request(app)
      .put(`/api/v1/items/${item.id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ price: 1 });

    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/v1/items/:id', () => {
  it('owner deletes their item', async () => {
    const { user, store } = await createStoreOwner();
    const token = tokenFor({ id: user.id, role: 'STORE_OWNER', phone: user.phone });
    const item = await createItem(store.id);

    const res = await request(app)
      .delete(`/api/v1/items/${item.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const remaining = await prisma.storeItem.findUnique({ where: { id: item.id } });
    expect(remaining).toBeNull();
  });

  it('returns 404 when item does not exist', async () => {
    const { user } = await createStoreOwner();
    const token = tokenFor({ id: user.id, role: 'STORE_OWNER', phone: user.phone });
    const res = await request(app)
      .delete('/api/v1/items/clxxxxxxxxxxxxxxxxxxxxxxx')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/v1/items/:id/toggle-availability', () => {
  it('flips isAvailable', async () => {
    const { user, store } = await createStoreOwner();
    const token = tokenFor({ id: user.id, role: 'STORE_OWNER', phone: user.phone });
    const item = await createItem(store.id, { isAvailable: true });

    const res = await request(app)
      .put(`/api/v1/items/${item.id}/toggle-availability`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.isAvailable).toBe(false);
  });
});

describe('PUT /api/v1/items/:id/stock', () => {
  it('updates stockQty', async () => {
    const { user, store } = await createStoreOwner();
    const token = tokenFor({ id: user.id, role: 'STORE_OWNER', phone: user.phone });
    const item = await createItem(store.id, { stockQty: 5 });

    const res = await request(app)
      .put(`/api/v1/items/${item.id}/stock`)
      .set('Authorization', `Bearer ${token}`)
      .send({ stockQty: 99 });

    expect(res.status).toBe(200);
    expect(res.body.data.stockQty).toBe(99);
  });

  it('rejects negative stockQty', async () => {
    const { user, store } = await createStoreOwner();
    const token = tokenFor({ id: user.id, role: 'STORE_OWNER', phone: user.phone });
    const item = await createItem(store.id);

    const res = await request(app)
      .put(`/api/v1/items/${item.id}/stock`)
      .set('Authorization', `Bearer ${token}`)
      .send({ stockQty: -3 });

    expect(res.status).toBe(400);
  });
});
