/**
 * Integration tests for the location-aware item search endpoint.
 *
 * `/api/v1/items/search` has two call shapes:
 *   - legacy keyword (no lat/lng) — already covered by items.test.ts
 *   - location-aware (lat+lng+sort+radius) — covered here
 *
 * These tests use real Postgres via the shared test helpers; nothing about
 * Prisma is mocked. The matching/notification queues are stubbed because
 * the routes mount the workers indirectly.
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
import { prisma } from '../src/config/prisma';
import { createStoreOwner, createItem } from './helpers/factory';

const app = createTestApp();

// Delhi-centric coordinates the factories default to.
const DELHI = { lat: 28.6139, lng: 77.209 };

describe('GET /api/v1/items/search — location-aware mode', () => {
  it('returns nearby items ranked by recommended score (default sort)', async () => {
    const { store: nearby } = await createStoreOwner({
      lat: DELHI.lat,
      lng: DELHI.lng,
    });
    await createItem(nearby.id, { name: 'Aashirvaad Atta', price: 120 });
    await createItem(nearby.id, { name: 'Tata Salt', price: 28 });

    const res = await request(app)
      .get('/api/v1/items/search')
      .query({ lat: DELHI.lat, lng: DELHI.lng, sort: 'recommended', limit: 10 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.items)).toBe(true);
    expect(res.body.data.items.length).toBeGreaterThanOrEqual(2);
    // Each item is flat — easy to consume by the web app.
    expect(res.body.data.items[0]).toMatchObject({
      storeItemId: expect.any(String),
      name: expect.any(String),
      price: expect.any(Number),
      store: { id: expect.any(String), name: expect.any(String) },
    });
    expect(res.body.data).toHaveProperty('radiusKm');
  });

  it('cheapest sort orders items by ascending price', async () => {
    const { store } = await createStoreOwner({ lat: DELHI.lat, lng: DELHI.lng });
    await createItem(store.id, { name: 'Cheap Rice', price: 40 });
    await createItem(store.id, { name: 'Mid Rice', price: 120 });
    await createItem(store.id, { name: 'Premium Rice', price: 280 });

    const res = await request(app)
      .get('/api/v1/items/search')
      .query({ q: 'rice', lat: DELHI.lat, lng: DELHI.lng, sort: 'cheapest' });

    expect(res.status).toBe(200);
    const prices = res.body.data.items.map((i: { price: number }) => i.price);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    expect(prices[0]).toBe(40);
  });

  it('nearest sort orders items by ascending distance', async () => {
    const { store: near } = await createStoreOwner({ lat: DELHI.lat, lng: DELHI.lng });
    // Same item name in two stores, one ~3 km away
    const farLat = DELHI.lat + 0.027; // ~3km north
    const { store: far } = await createStoreOwner({ lat: farLat, lng: DELHI.lng });

    await createItem(near.id, { name: 'Maggi Noodles', price: 14 });
    await createItem(far.id, { name: 'Maggi Noodles', price: 14 });

    const res = await request(app)
      .get('/api/v1/items/search')
      .query({ q: 'maggi', lat: DELHI.lat, lng: DELHI.lng, sort: 'nearest', radius: 10 });

    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBe(2);
    expect(res.body.data.items[0].store.id).toBe(near.id);
    expect(res.body.data.items[0].store.distanceKm).toBeLessThan(
      res.body.data.items[1].store.distanceKm,
    );
  });

  it('respects the radius parameter — items outside are excluded', async () => {
    const { store } = await createStoreOwner({
      lat: DELHI.lat + 0.3, // ~33 km north (inside the endpoint's 50 km cap)
      lng: DELHI.lng,
    });
    await createItem(store.id, { name: 'Faraway Sugar', price: 50 });

    const tight = await request(app)
      .get('/api/v1/items/search')
      .query({ q: 'faraway', lat: DELHI.lat, lng: DELHI.lng, radius: 5 });
    expect(tight.status).toBe(200);
    expect(tight.body.data.items.length).toBe(0);

    const wide = await request(app)
      .get('/api/v1/items/search')
      .query({ q: 'faraway', lat: DELHI.lat, lng: DELHI.lng, radius: 50 });
    expect(wide.status).toBe(200);
    expect(wide.body.data.items.length).toBeGreaterThanOrEqual(1);
  });

  it('excludes wholesaler stores from customer search', async () => {
    const { store } = await createStoreOwner({ lat: DELHI.lat, lng: DELHI.lng });
    await prisma.store.update({ where: { id: store.id }, data: { isWholesaler: true } });
    await createItem(store.id, { name: 'Wholesale Atta', price: 100 });

    const res = await request(app)
      .get('/api/v1/items/search')
      .query({ q: 'wholesale', lat: DELHI.lat, lng: DELHI.lng });

    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBe(0);
  });

  it('excludes closed stores from customer search', async () => {
    const { store } = await createStoreOwner({
      lat: DELHI.lat,
      lng: DELHI.lng,
      isOpen: false,
    });
    await createItem(store.id, { name: 'Sleeping Sugar', price: 50 });

    const res = await request(app)
      .get('/api/v1/items/search')
      .query({ q: 'sleeping', lat: DELHI.lat, lng: DELHI.lng });

    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBe(0);
  });
});

describe('GET /api/v1/items/:id', () => {
  it('returns the storeItem joined with catalog + store', async () => {
    const { store } = await createStoreOwner({ lat: DELHI.lat, lng: DELHI.lng });
    const item = await createItem(store.id, { name: 'Detail Rice', price: 75 });

    const res = await request(app).get(`/api/v1/items/${item.id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.storeItem.id).toBe(item.id);
    expect(res.body.data.catalogItem.name).toBe('Detail Rice');
    expect(res.body.data.store.id).toBe(store.id);
  });

  it('includes distanceKm when lat/lng provided', async () => {
    const { store } = await createStoreOwner({ lat: DELHI.lat, lng: DELHI.lng });
    const item = await createItem(store.id, { name: 'Distance Atta' });

    const res = await request(app)
      .get(`/api/v1/items/${item.id}`)
      .query({ lat: DELHI.lat + 0.01, lng: DELHI.lng });

    expect(res.status).toBe(200);
    expect(res.body.data.store.distanceKm).not.toBeNull();
    expect(typeof res.body.data.store.distanceKm).toBe('number');
  });

  it('returns 404 when the item does not exist', async () => {
    const res = await request(app).get('/api/v1/items/non-existent-id');
    expect(res.status).toBe(404);
  });
});
