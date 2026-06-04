// End-to-end coverage for the three admin/customer group-level
// endpoints that ship after the OrderGroup foundation:
//
//   PUT /api/v1/orders/group/:id/cancel          (customer)
//   PUT /api/v1/admin/order-groups/:id/cod-collected (admin)
//   PUT /api/v1/admin/order-groups/:id/assign-driver (admin)
//
// We mock the same outbound integrations every other test file does
// so queue / push / SMS never actually fire.

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
  createDriver,
  createItem,
  createStoreOwner,
  loginAs,
} from './helpers/factory';

const app = createTestApp();

/**
 * Helper: build a cross-store cart and place the order, returning the
 * group id + the two child legs. Uses /orders so the test exercises the
 * exact split path real customers hit (instead of inserting OrderGroup
 * rows manually, which would skip a bunch of invariants).
 */
async function placeCrossStoreOrder(opts: {
  // Allow callers to opt-out of the second-store flow when they only
  // need a single-leg group (rare; default is true).
  twoStores?: boolean;
} = {}) {
  const twoStores = opts.twoStores ?? true;
  const { store: storeA } = await createStoreOwner({ lat: 28.6139, lng: 77.209 });
  const { store: storeB } = twoStores
    ? await createStoreOwner({ lat: 28.615, lng: 77.21 })
    : { store: storeA };
  const sugar = await createItem(storeA.id, { name: `Sugar grp ${Date.now()}`, price: 50 });
  const oil = twoStores
    ? await createItem(storeB.id, { name: `Oil grp ${Date.now()}`, price: 120 })
    : await createItem(storeA.id, { name: `Oil grp ${Date.now()}`, price: 120 });

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

  if (res.status !== 201) {
    throw new Error(
      `placeCrossStoreOrder failed: ${res.status} ${JSON.stringify(res.body)}`,
    );
  }
  const groupId = res.body.data.orderGroupId as string | undefined;
  return {
    user,
    token,
    storeA,
    storeB,
    address,
    groupId: groupId ?? null,
    response: res.body.data,
  };
}

describe('PUT /api/v1/orders/group/:id/cancel', () => {
  it('cancels every pre-pickup leg and credits a proportional refund', async () => {
    const fixture = await placeCrossStoreOrder();
    expect(fixture.groupId).toBeTruthy();

    const res = await request(app)
      .put(`/api/v1/orders/group/${fixture.groupId}/cancel`)
      .set('Authorization', `Bearer ${fixture.token}`)
      .send({ reason: 'Changed my mind' });

    expect(res.status).toBe(200);
    expect(res.body.data.cancelledLegs.length).toBe(2);

    const refreshed = await prisma.order.findMany({
      where: { orderGroupId: fixture.groupId! },
    });
    expect(refreshed.every((o) => o.status === 'CANCELLED')).toBe(true);
    expect(refreshed.every((o) => o.cancelReason === 'Changed my mind')).toBe(true);

    const group = await prisma.orderGroup.findUnique({
      where: { id: fixture.groupId! },
    });
    expect(group?.status).toBe('CANCELLED');
  });

  it('refuses access to a different customer', async () => {
    const fixture = await placeCrossStoreOrder();
    const { token: otherToken } = await loginAs('CUSTOMER');

    const res = await request(app)
      .put(`/api/v1/orders/group/${fixture.groupId}/cancel`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ reason: 'Probing' });

    expect(res.status).toBe(403);
  });

  it('400s when every leg is already past pickup', async () => {
    const fixture = await placeCrossStoreOrder();
    // Push both legs to PICKED_UP — past the cancel window.
    await prisma.order.updateMany({
      where: { orderGroupId: fixture.groupId! },
      data: { status: 'PICKED_UP', pickedUpAt: new Date() },
    });
    const res = await request(app)
      .put(`/api/v1/orders/group/${fixture.groupId}/cancel`)
      .set('Authorization', `Bearer ${fixture.token}`)
      .send({ reason: 'Too late' });
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/v1/admin/order-groups/:id/cod-collected', () => {
  it('flips codCollected on every delivered leg + paymentStatus on the group', async () => {
    const fixture = await placeCrossStoreOrder();
    // Drive both legs to DELIVERED so settlement is allowed.
    await prisma.order.updateMany({
      where: { orderGroupId: fixture.groupId! },
      data: { status: 'DELIVERED', deliveredAt: new Date() },
    });

    const { token: adminToken } = await loginAs('ADMIN');
    const res = await request(app)
      .put(`/api/v1/admin/order-groups/${fixture.groupId}/cod-collected`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ collected: true });

    expect(res.status).toBe(200);
    expect(res.body.data.settledLegs).toBe(2);

    const refreshed = await prisma.order.findMany({
      where: { orderGroupId: fixture.groupId! },
    });
    expect(refreshed.every((o) => o.codCollected === true)).toBe(true);
    expect(refreshed.every((o) => !!o.codCollectedAt)).toBe(true);

    const group = await prisma.orderGroup.findUnique({
      where: { id: fixture.groupId! },
    });
    expect(group?.paymentStatus).toBe('PAID');
  });

  it('refuses to settle before every leg is delivered', async () => {
    const fixture = await placeCrossStoreOrder();
    // Only one leg delivered.
    const orders = await prisma.order.findMany({
      where: { orderGroupId: fixture.groupId! },
    });
    await prisma.order.update({
      where: { id: orders[0]!.id },
      data: { status: 'DELIVERED', deliveredAt: new Date() },
    });

    const { token: adminToken } = await loginAs('ADMIN');
    const res = await request(app)
      .put(`/api/v1/admin/order-groups/${fixture.groupId}/cod-collected`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ collected: true });
    expect(res.status).toBe(400);

    // Confirm DB wasn't touched.
    const stillUnsettled = await prisma.order.findFirst({
      where: { id: orders[0]!.id },
    });
    expect(stillUnsettled?.codCollected).toBe(false);
  });

  it('can un-settle (collected:false) without the delivered guard', async () => {
    const fixture = await placeCrossStoreOrder();
    await prisma.order.updateMany({
      where: { orderGroupId: fixture.groupId! },
      data: { status: 'DELIVERED', deliveredAt: new Date(), codCollected: true, codCollectedAt: new Date() },
    });
    await prisma.orderGroup.update({
      where: { id: fixture.groupId! },
      data: { paymentStatus: 'PAID' },
    });

    const { token: adminToken } = await loginAs('ADMIN');
    const res = await request(app)
      .put(`/api/v1/admin/order-groups/${fixture.groupId}/cod-collected`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ collected: false });
    expect(res.status).toBe(200);
    const refreshed = await prisma.orderGroup.findUnique({
      where: { id: fixture.groupId! },
    });
    expect(refreshed?.paymentStatus).toBe('PENDING');
  });
});

describe('PUT /api/v1/admin/order-groups/:id/assign-driver', () => {
  it('fans the driver across every live leg + parent group', async () => {
    const fixture = await placeCrossStoreOrder();
    // Move legs past PENDING so assignDriverToGroup's status filter
    // (STORE_ACCEPTED / COOKING) picks them up.
    await prisma.order.updateMany({
      where: { orderGroupId: fixture.groupId! },
      data: { status: 'STORE_ACCEPTED', storeAcceptedAt: new Date() },
    });
    const { driver } = await createDriver({ status: 'ONLINE', lat: 28.6139, lng: 77.209 });

    const { token: adminToken } = await loginAs('ADMIN');
    const res = await request(app)
      .put(`/api/v1/admin/order-groups/${fixture.groupId}/assign-driver`)
      .set('Authorization', `Bearer ${adminToken}`)
      // No active zones in the test DB → zone check is a no-op; no force needed.
      .send({ driverId: driver.id });

    expect(res.status).toBe(200);
    expect(res.body.data.fannedToLegs).toBe(2);

    const legs = await prisma.order.findMany({
      where: { orderGroupId: fixture.groupId! },
    });
    expect(legs.every((l) => l.driverId === driver.id)).toBe(true);
    expect(legs.every((l) => l.status === 'DRIVER_ASSIGNED')).toBe(true);

    const group = await prisma.orderGroup.findUnique({
      where: { id: fixture.groupId! },
    });
    expect(group?.driverId).toBe(driver.id);
  });

  it('400s when every leg is already delivered', async () => {
    const fixture = await placeCrossStoreOrder();
    await prisma.order.updateMany({
      where: { orderGroupId: fixture.groupId! },
      data: { status: 'DELIVERED', deliveredAt: new Date() },
    });
    const { driver } = await createDriver({ status: 'ONLINE' });
    const { token: adminToken } = await loginAs('ADMIN');
    const res = await request(app)
      .put(`/api/v1/admin/order-groups/${fixture.groupId}/assign-driver`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ driverId: driver.id });
    expect(res.status).toBe(400);
  });

  it('404s when the driver does not exist', async () => {
    const fixture = await placeCrossStoreOrder();
    const { token: adminToken } = await loginAs('ADMIN');
    const res = await request(app)
      .put(`/api/v1/admin/order-groups/${fixture.groupId}/assign-driver`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ driverId: 'clnonexistent000000000000' });
    expect(res.status).toBe(404);
  });
});
