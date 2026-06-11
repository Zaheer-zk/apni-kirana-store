/**
 * Integration tests for the customer favorites / wishlist endpoints.
 *
 * Favorites are keyed on `catalogItemId` (the canonical product). The list
 * endpoint re-resolves the cheapest in-stock nearby store as `bestOffer` when
 * lat/lng are supplied. Real Postgres via the shared helpers — nothing mocked
 * about Prisma. Queues + notifications are stubbed because the app mounts them.
 */
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
import { createCustomer, createStoreOwner, createItem, tokenFor } from './helpers/factory';

const app = createTestApp();
const DELHI = { lat: 28.6139, lng: 77.209 };

describe('Favorites endpoints', () => {
  it('adds, lists, and removes a favorite (idempotent)', async () => {
    const customer = await createCustomer();
    const token = tokenFor(customer);
    const { store } = await createStoreOwner({ lat: DELHI.lat, lng: DELHI.lng });
    const item = await createItem(store.id, { name: 'Fav Atta', price: 120 });

    // Add
    const add = await request(app)
      .post('/api/v1/favorites')
      .set('Authorization', `Bearer ${token}`)
      .send({ catalogItemId: item.catalogItemId });
    expect(add.status).toBe(200);
    expect(add.body.data.favorited).toBe(true);

    // Re-add is idempotent (no duplicate, still 200)
    const addAgain = await request(app)
      .post('/api/v1/favorites')
      .set('Authorization', `Bearer ${token}`)
      .send({ catalogItemId: item.catalogItemId });
    expect(addAgain.status).toBe(200);

    // ids lists exactly one
    const ids = await request(app)
      .get('/api/v1/favorites/ids')
      .set('Authorization', `Bearer ${token}`);
    expect(ids.status).toBe(200);
    expect(ids.body.data.ids).toEqual([item.catalogItemId]);

    // List with location resolves a bestOffer
    const list = await request(app)
      .get('/api/v1/favorites')
      .query({ lat: DELHI.lat, lng: DELHI.lng })
      .set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.data.items).toHaveLength(1);
    expect(list.body.data.items[0]).toMatchObject({
      catalogItemId: item.catalogItemId,
      name: 'Fav Atta',
      offerCount: 1,
    });
    expect(list.body.data.items[0].bestOffer).toMatchObject({
      storeItemId: item.id,
      customerPrice: 120,
    });

    // Remove
    const del = await request(app)
      .delete(`/api/v1/favorites/${item.catalogItemId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(200);
    expect(del.body.data.favorited).toBe(false);

    const idsAfter = await request(app)
      .get('/api/v1/favorites/ids')
      .set('Authorization', `Bearer ${token}`);
    expect(idsAfter.body.data.ids).toEqual([]);
  });

  it('picks the cheapest nearby store as bestOffer', async () => {
    const customer = await createCustomer();
    const token = tokenFor(customer);
    const { store: pricey } = await createStoreOwner({ lat: DELHI.lat, lng: DELHI.lng });
    const expensive = await createItem(pricey.id, { name: 'Shared Sugar', price: 60 });
    const { store: cheap } = await createStoreOwner({ lat: DELHI.lat, lng: DELHI.lng });
    // Same catalog item (createItem upserts CatalogItem by name) at a lower price.
    const cheaper = await createItem(cheap.id, { name: 'Shared Sugar', price: 45 });

    expect(cheaper.catalogItemId).toBe(expensive.catalogItemId);

    await request(app)
      .post('/api/v1/favorites')
      .set('Authorization', `Bearer ${token}`)
      .send({ catalogItemId: expensive.catalogItemId });

    const list = await request(app)
      .get('/api/v1/favorites')
      .query({ lat: DELHI.lat, lng: DELHI.lng })
      .set('Authorization', `Bearer ${token}`);

    expect(list.body.data.items[0].offerCount).toBe(2);
    expect(list.body.data.items[0].bestOffer.customerPrice).toBe(45);
  });

  it('rejects unauthenticated access', async () => {
    const res = await request(app).get('/api/v1/favorites/ids');
    expect(res.status).toBe(401);
  });

  it('404s when favoriting a non-existent product', async () => {
    const customer = await createCustomer();
    const token = tokenFor(customer);
    const res = await request(app)
      .post('/api/v1/favorites')
      .set('Authorization', `Bearer ${token}`)
      .send({ catalogItemId: 'does-not-exist' });
    expect(res.status).toBe(404);
  });
});
