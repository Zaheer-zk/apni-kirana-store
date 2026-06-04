// Multi-store OrderGroup behaviour. Two layers:
//   1. planSplit() — pure unit, no DB. Verifies the greedy set-cover
//      picks sensible store combinations and returns null when no
//      combination covers the cart.
//   2. POST /orders end-to-end — when a cart spans stores AND no
//      single store has everything, the endpoint creates an
//      OrderGroup parent + N child Orders, NOT a 422.
//
// We mock outbound integrations the same way admin.test.ts does so
// queue / push / SMS calls don't actually fire.

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
jest.mock('../src/services/email.service', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  sendNewStoreAwaitingApprovalEmail: jest.fn().mockResolvedValue(undefined),
  sendNewDriverAwaitingApprovalEmail: jest.fn().mockResolvedValue(undefined),
  sendAccountApprovedEmail: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/services/web-push.service', () => ({
  sendWebPushToUser: jest.fn().mockResolvedValue(undefined),
  getVapidPublicKey: jest.fn().mockReturnValue(''),
}));

import request from 'supertest';
import { createTestApp } from './helpers/app';
import { prisma } from '../src/config/prisma';
import {
  createAddress,
  createItem,
  createStoreOwner,
  loginAs,
} from './helpers/factory';
import { planSplit } from '../src/services/order-group.service';

const app = createTestApp();

describe('planSplit', () => {
  const dropoff = { lat: 28.6139, lng: 77.209 };

  it('picks one store when it covers everything', () => {
    const plan = planSplit(
      ['cat-a', 'cat-b'],
      [
        {
          id: 's1',
          lat: 28.6,
          lng: 77.2,
          items: [
            { id: 'i1', catalogItemId: 'cat-a', price: 0, adminMargin: 0, stockQty: 10 },
            { id: 'i2', catalogItemId: 'cat-b', price: 0, adminMargin: 0, stockQty: 10 },
          ],
        },
      ],
      dropoff,
    );
    expect(plan).not.toBeNull();
    expect(plan!.length).toBe(1);
    expect(plan![0]!.storeId).toBe('s1');
    expect(plan![0]!.catalogItemIds.sort()).toEqual(['cat-a', 'cat-b']);
  });

  it('splits across two stores when neither has everything', () => {
    const plan = planSplit(
      ['cat-a', 'cat-b'],
      [
        {
          id: 's1',
          lat: 28.6,
          lng: 77.2,
          items: [{ id: 'i1', catalogItemId: 'cat-a', price: 0, adminMargin: 0, stockQty: 10 }],
        },
        {
          id: 's2',
          lat: 28.61,
          lng: 77.21,
          items: [{ id: 'i2', catalogItemId: 'cat-b', price: 0, adminMargin: 0, stockQty: 10 }],
        },
      ],
      dropoff,
    );
    expect(plan).not.toBeNull();
    expect(plan!.length).toBe(2);
    const storeIds = plan!.map((p) => p.storeId).sort();
    expect(storeIds).toEqual(['s1', 's2']);
  });

  it('prefers the store that covers MORE items first', () => {
    // s1 covers a+b; s2 covers c. Greedy must pick s1 first.
    const plan = planSplit(
      ['cat-a', 'cat-b', 'cat-c'],
      [
        {
          id: 's2',
          lat: 28.61,
          lng: 77.21,
          items: [{ id: 'i3', catalogItemId: 'cat-c', price: 0, adminMargin: 0, stockQty: 10 }],
        },
        {
          id: 's1',
          lat: 28.6,
          lng: 77.2,
          items: [
            { id: 'i1', catalogItemId: 'cat-a', price: 0, adminMargin: 0, stockQty: 10 },
            { id: 'i2', catalogItemId: 'cat-b', price: 0, adminMargin: 0, stockQty: 10 },
          ],
        },
      ],
      dropoff,
    );
    expect(plan).not.toBeNull();
    expect(plan!.length).toBe(2);
    expect(plan![0]!.storeId).toBe('s1'); // covered 2 → first
    expect(plan![0]!.catalogItemIds.sort()).toEqual(['cat-a', 'cat-b']);
    expect(plan![1]!.storeId).toBe('s2');
    expect(plan![1]!.catalogItemIds).toEqual(['cat-c']);
  });

  it('returns null when no combination covers the cart', () => {
    const plan = planSplit(
      ['cat-a', 'cat-missing'],
      [
        {
          id: 's1',
          lat: 28.6,
          lng: 77.2,
          items: [{ id: 'i1', catalogItemId: 'cat-a', price: 0, adminMargin: 0, stockQty: 10 }],
        },
      ],
      dropoff,
    );
    expect(plan).toBeNull();
  });
});

describe('POST /orders — multi-store split', () => {
  it('creates an OrderGroup with one Order per store when no single store covers', async () => {
    // Two stores in the same neighbourhood, each carrying a different item.
    const { store: storeA } = await createStoreOwner({ lat: 28.6139, lng: 77.209 });
    const { store: storeB } = await createStoreOwner({ lat: 28.615, lng: 77.21 });
    const sugar = await createItem(storeA.id, { name: 'Sugar 1kg test', price: 50 });
    const oil = await createItem(storeB.id, { name: 'Oil 1L test', price: 120 });
    // Confirm: neither store has the OTHER item, so a single-store
    // resolution would 422 without planSplit.

    const { token, user } = await loginAs('CUSTOMER');
    const address = await createAddress(user.id, { lat: 28.6139, lng: 77.209 });

    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [
          { catalogItemId: sugar.catalogItemId, qty: 1 },
          { catalogItemId: oil.catalogItemId, qty: 1 },
        ],
        deliveryAddressId: address.id,
        paymentMethod: 'CASH_ON_DELIVERY',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.orderGroupId).toBeTruthy();
    expect(res.body.data.orderGroup.orders.length).toBe(2);

    // DB verification — both child Orders exist, both link to the same
    // OrderGroup, each from a different store.
    const groupId = res.body.data.orderGroupId as string;
    const children = await prisma.order.findMany({
      where: { orderGroupId: groupId },
      include: { items: true },
    });
    expect(children.length).toBe(2);
    const storeIds = children.map((c) => c.storeId).sort();
    expect(storeIds).toEqual([storeA.id, storeB.id].sort());
    // Per-leg deliveryFee is 0 — single fee on the group parent.
    expect(children.every((c) => c.deliveryFee === 0)).toBe(true);

    const group = await prisma.orderGroup.findUnique({ where: { id: groupId } });
    expect(group).not.toBeNull();
    expect(group!.deliveryFee).toBeGreaterThan(0);
    expect(group!.subtotal).toBe(50 + 120);
  });

  it('still creates a single Order (no group) when one store covers everything', async () => {
    const { store } = await createStoreOwner({ lat: 28.6139, lng: 77.209 });
    const sugar = await createItem(store.id, { name: 'Sugar single test', price: 50 });
    const oil = await createItem(store.id, { name: 'Oil single test', price: 120 });

    const { token, user } = await loginAs('CUSTOMER');
    const address = await createAddress(user.id, { lat: 28.6139, lng: 77.209 });

    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [
          { catalogItemId: sugar.catalogItemId, qty: 1 },
          { catalogItemId: oil.catalogItemId, qty: 1 },
        ],
        deliveryAddressId: address.id,
        paymentMethod: 'CASH_ON_DELIVERY',
      });

    expect(res.status).toBe(201);
    // Single-store happy path: no orderGroup in the response.
    expect(res.body.data.orderGroupId ?? null).toBeNull();
    expect(res.body.data.orderGroup ?? null).toBeNull();
    expect(res.body.data.storeId).toBe(store.id);
  });
});
