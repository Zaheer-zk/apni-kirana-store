// Defensive invariants: restock orders (B2B store-to-wholesaler) MUST
// never get pulled into the OrderGroup multi-store flow. A restock
// goes through its own POST /orders/restock handler with its own
// pricing rules (commission=0, single wholesaler, buyer's store as
// the dropoff). If a refactor ever accidentally enrolled restock
// orders into the cross-zone split path, this test fails loudly.
//
// What we verify
// --------------
//   1. A restock order created via POST /orders/restock has
//      orderGroupId = null (no group enrolment by default)
//   2. The customer-facing GET /orders/group/:id returns 404 when
//      given a restock order's id (group != order — separate keyspace)
//   3. The customer-facing cross-zone POST /orders that DOES create
//      groups still respects the wholesaler filter (covered by
//      order-group.test.ts; this file is the focused restock check)
//
// Mocks mirror the rest of the order-group tests.

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
  createItem,
  createStoreOwner,
  loginAs,
  tokenFor,
} from './helpers/factory';

const app = createTestApp();

describe('Restock × OrderGroup isolation', () => {
  it('POST /orders/restock creates an Order with orderGroupId = null', async () => {
    // Buyer = a retail store. We use the helper + sign a token for the
    // owner directly to avoid the OTP flow.
    const { user: buyerOwner, store: buyerStore } = await createStoreOwner({
      lat: 28.6139,
      lng: 77.209,
    });
    const buyerToken = tokenFor(buyerOwner);

    // Wholesaler = a separate store flagged isWholesaler.
    const { store: wholesaler } = await createStoreOwner({
      lat: 28.6139,
      lng: 77.209,
    });
    await prisma.store.update({
      where: { id: wholesaler.id },
      data: { isWholesaler: true },
    });
    // Stock the wholesaler with a catalog item.
    const sugar = await createItem(wholesaler.id, {
      name: `Wholesale Sugar ${Date.now()}`,
      price: 40,
    });

    const res = await request(app)
      .post('/api/v1/orders/restock')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        items: [{ catalogItemId: sugar.catalogItemId, qty: 10 }],
        paymentMethod: 'CASH_ON_DELIVERY',
      });

    expect(res.status).toBe(201);
    const orderId = res.body.data.id as string;
    expect(orderId).toBeTruthy();

    const created = await prisma.order.findUnique({ where: { id: orderId } });
    expect(created).not.toBeNull();
    expect(created!.orderType).toBe('RESTOCK');
    expect(created!.orderGroupId).toBeNull();
    // Buyer = owner of the buyer store, dropoff = buyer store address,
    // pickup = wholesaler. Sanity-checking the schema invariants so a
    // refactor of the restock handler doesn't silently break the wiring.
    expect(created!.buyerStoreId).toBe(buyerStore.id);
    expect(created!.storeId).toBe(wholesaler.id);
    expect(created!.commission).toBe(0);
  });

  it('GET /orders/group/:id with a restock order id returns 404', async () => {
    const { user: buyerOwner } = await createStoreOwner({
      lat: 28.6139,
      lng: 77.209,
    });
    const buyerToken = tokenFor(buyerOwner);
    const { store: wholesaler } = await createStoreOwner({
      lat: 28.6139,
      lng: 77.209,
    });
    await prisma.store.update({
      where: { id: wholesaler.id },
      data: { isWholesaler: true },
    });
    const oil = await createItem(wholesaler.id, {
      name: `Wholesale Oil ${Date.now()}`,
      price: 100,
    });
    const created = await request(app)
      .post('/api/v1/orders/restock')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        items: [{ catalogItemId: oil.catalogItemId, qty: 3 }],
        paymentMethod: 'CASH_ON_DELIVERY',
      });
    expect(created.status).toBe(201);
    const orderId = created.body.data.id as string;

    // The restock order's ID is in the Order keyspace, NOT OrderGroup.
    // Hitting GET /orders/group/<orderId> must 404 — group lookup must
    // not accidentally fall through to the orders table.
    const { token: customerToken } = await loginAs('CUSTOMER');
    const res = await request(app)
      .get(`/api/v1/orders/group/${orderId}`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res.status).toBe(404);
  });
});
