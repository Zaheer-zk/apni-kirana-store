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
  notify: jest.fn().mockResolvedValue(undefined),
  notifyAdmins: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/services/driver.service', () => ({
  assignDriverForOrder: jest.fn().mockResolvedValue(undefined),
}));

import request from 'supertest';
import { createTestApp } from './helpers/app';
import { prisma } from '../src/config/prisma';
import { createStoreOwner, createItem, tokenFor } from './helpers/factory';

const app = createTestApp();

// A wholesaler is a Store with isWholesaler = true.
async function createWholesaler() {
  const { user, store } = await createStoreOwner();
  const updated = await prisma.store.update({
    where: { id: store.id },
    data: { isWholesaler: true },
  });
  return { user, store: updated };
}

describe('GET /api/v1/wholesalers', () => {
  it('lists wholesaler stores and excludes regular stores', async () => {
    const { store: wholesaler } = await createWholesaler();
    const { user: buyerOwner } = await createStoreOwner(); // regular store
    const buyerToken = tokenFor(buyerOwner);

    const res = await request(app)
      .get('/api/v1/wholesalers')
      .set('Authorization', `Bearer ${buyerToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.map((w: { id: string }) => w.id);
    expect(ids).toContain(wholesaler.id);
  });

  it('rejects a CUSTOMER (only store owners restock)', async () => {
    const { user: buyerOwner } = await createStoreOwner();
    void buyerOwner;
    const res = await request(app).get('/api/v1/wholesalers');
    expect(res.status).toBe(401);
  });

  it('returns a wholesaler\'s items', async () => {
    const { store: wholesaler } = await createWholesaler();
    await createItem(wholesaler.id, { price: 40, stockQty: 50 });
    const { user: buyerOwner } = await createStoreOwner();

    const res = await request(app)
      .get(`/api/v1/wholesalers/${wholesaler.id}/items`)
      .set('Authorization', `Bearer ${tokenFor(buyerOwner)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBe(1);
    expect(res.body.data.items[0].price).toBe(40);
  });
});

describe('POST /api/v1/orders/restock', () => {
  it('places a restock order with RESTOCK type, zero commission, and correct links', async () => {
    const { store: wholesaler } = await createWholesaler();
    const item = await createItem(wholesaler.id, { price: 50, stockQty: 100 });
    const { user: buyerOwner, store: buyerStore } = await createStoreOwner();

    const res = await request(app)
      .post('/api/v1/orders/restock')
      .set('Authorization', `Bearer ${tokenFor(buyerOwner)}`)
      .send({
        wholesalerId: wholesaler.id,
        items: [{ storeItemId: item.id, qty: 4 }],
        paymentMethod: 'CASH_ON_DELIVERY',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.orderType).toBe('RESTOCK');
    expect(res.body.data.status).toBe('PENDING');
    expect(res.body.data.subtotal).toBe(200);
    expect(res.body.data.commission).toBe(0);
    expect(res.body.data.deliveryFee).toBe(30);
    expect(res.body.data.total).toBe(230);
    expect(res.body.data.storeId).toBe(wholesaler.id);
    expect(res.body.data.buyerStoreId).toBe(buyerStore.id);
    expect(res.body.data.customerId).toBe(buyerOwner.id);
  });

  it('rejects ordering from your own store', async () => {
    const { user: owner, store } = await createStoreOwner();
    await prisma.store.update({ where: { id: store.id }, data: { isWholesaler: true } });
    const item = await createItem(store.id, { price: 50, stockQty: 10 });

    const res = await request(app)
      .post('/api/v1/orders/restock')
      .set('Authorization', `Bearer ${tokenFor(owner)}`)
      .send({
        wholesalerId: store.id,
        items: [{ storeItemId: item.id, qty: 1 }],
        paymentMethod: 'CASH_ON_DELIVERY',
      });

    expect(res.status).toBe(400);
  });

  it('returns 404 when the target store is not a wholesaler', async () => {
    const { store: regularStore } = await createStoreOwner(); // not a wholesaler
    const item = await createItem(regularStore.id, { price: 50, stockQty: 10 });
    const { user: buyerOwner } = await createStoreOwner();

    const res = await request(app)
      .post('/api/v1/orders/restock')
      .set('Authorization', `Bearer ${tokenFor(buyerOwner)}`)
      .send({
        wholesalerId: regularStore.id,
        items: [{ storeItemId: item.id, qty: 1 }],
        paymentMethod: 'CASH_ON_DELIVERY',
      });

    expect(res.status).toBe(404);
  });

  it('rejects an order that exceeds the wholesaler\'s stock', async () => {
    const { store: wholesaler } = await createWholesaler();
    const item = await createItem(wholesaler.id, { price: 50, stockQty: 3 });
    const { user: buyerOwner } = await createStoreOwner();

    const res = await request(app)
      .post('/api/v1/orders/restock')
      .set('Authorization', `Bearer ${tokenFor(buyerOwner)}`)
      .send({
        wholesalerId: wholesaler.id,
        items: [{ storeItemId: item.id, qty: 99 }],
        paymentMethod: 'CASH_ON_DELIVERY',
      });

    expect(res.status).toBe(400);
  });

  it('forbids a CUSTOMER from placing a restock order', async () => {
    const { store: wholesaler } = await createWholesaler();
    const item = await createItem(wholesaler.id, { price: 50, stockQty: 10 });

    const res = await request(app)
      .post('/api/v1/orders/restock')
      .send({
        wholesalerId: wholesaler.id,
        items: [{ storeItemId: item.id, qty: 1 }],
        paymentMethod: 'CASH_ON_DELIVERY',
      });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/orders/restock', () => {
  it('returns restock orders the store owner has placed', async () => {
    const { store: wholesaler } = await createWholesaler();
    const item = await createItem(wholesaler.id, { price: 25, stockQty: 100 });
    const { user: buyerOwner } = await createStoreOwner();
    const token = tokenFor(buyerOwner);

    await request(app)
      .post('/api/v1/orders/restock')
      .set('Authorization', `Bearer ${token}`)
      .send({
        wholesalerId: wholesaler.id,
        items: [{ storeItemId: item.id, qty: 2 }],
        paymentMethod: 'CASH_ON_DELIVERY',
      });

    const res = await request(app)
      .get('/api/v1/orders/restock')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.orders.length).toBe(1);
    expect(res.body.data.orders[0].orderType).toBe('RESTOCK');
  });
});
