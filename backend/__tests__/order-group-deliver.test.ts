// Deliver-all endpoint coverage. Three scenarios:
//
//   1. Happy path — all legs PICKED_UP, OTP matches → every leg flips
//      to DELIVERED in one call.
//   2. Partial pickup — some legs still DRIVER_ASSIGNED → 400, no
//      mutation.
//   3. Wrong OTP → 400, no mutation. The endpoint also rejects a
//      group whose legs somehow have mismatched OTPs (data
//      corruption) with 500 to fail loud, but the happy-path
//      implementation guarantees identical OTPs at create time so
//      we don't write a fixture for that here.
//
// Plus a per-leg endpoint 409 verification: PUT /drivers/orders/:id/
// deliver MUST refuse when the leg has orderGroupId set, forcing
// callers into the atomic path.

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
jest.mock('../src/services/invoice.service', () => ({
  generateInvoiceForOrder: jest.fn().mockResolvedValue(undefined),
  resolveInvoiceAbsolutePath: jest.fn().mockReturnValue('/tmp/invoice.pdf'),
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
  tokenFor,
} from './helpers/factory';

const app = createTestApp();

/**
 * Build a 2-store cart, place a cross-store order so the engine
 * splits it, then drive every child to PICKED_UP. Returns ids the
 * tests need: groupId, driver token + id, the OTP, leg ids.
 */
async function readyGroupForDelivery() {
  const { store: storeA, user: ownerA } = await createStoreOwner({
    lat: 28.6139, lng: 77.209,
  });
  const { store: storeB, user: ownerB } = await createStoreOwner({
    lat: 28.615, lng: 77.21,
  });
  void ownerA; void ownerB;
  const sugar = await createItem(storeA.id, { name: `Sugar D ${Date.now()}`, price: 50 });
  const oil = await createItem(storeB.id, { name: `Oil D ${Date.now()}`, price: 120 });

  const { token: customerToken, user: customer } = await loginAs('CUSTOMER');
  const address = await createAddress(customer.id, { lat: 28.6139, lng: 77.209 });

  const placeRes = await request(app)
    .post('/api/v1/orders')
    .set('Authorization', `Bearer ${customerToken}`)
    .send({
      items: [
        { catalogItemId: sugar.catalogItemId, qty: 1 },
        { catalogItemId: oil.catalogItemId, qty: 1 },
      ],
      deliveryAddressId: address.id,
      paymentMethod: 'CASH_ON_DELIVERY',
    });
  if (placeRes.status !== 201) {
    throw new Error(
      `placeCrossStoreOrder failed: ${placeRes.status} ${JSON.stringify(placeRes.body)}`,
    );
  }
  const groupId = placeRes.body.data.orderGroupId as string;

  // Assign one driver to the whole group, then mark every leg PICKED_UP.
  const { driver, user: driverUser } = await createDriver({
    status: 'ONLINE',
    lat: 28.6139,
    lng: 77.209,
  });
  await prisma.orderGroup.update({
    where: { id: groupId },
    data: { driverId: driver.id },
  });
  await prisma.order.updateMany({
    where: { orderGroupId: groupId },
    data: {
      driverId: driver.id,
      status: 'PICKED_UP',
      storeAcceptedAt: new Date(),
      driverAssignedAt: new Date(),
      pickedUpAt: new Date(),
    },
  });

  const legs = await prisma.order.findMany({
    where: { orderGroupId: groupId },
    select: { id: true, dropoffOtp: true, status: true },
  });
  return {
    groupId,
    driverToken: tokenFor(driverUser),
    driverId: driver.id,
    legs,
    otp: legs[0]!.dropoffOtp!,
  };
}

describe('PUT /api/v1/drivers/order-groups/:id/deliver', () => {
  it('atomically delivers every PICKED_UP leg when the OTP matches', async () => {
    const fixture = await readyGroupForDelivery();
    const res = await request(app)
      .put(`/api/v1/drivers/order-groups/${fixture.groupId}/deliver`)
      .set('Authorization', `Bearer ${fixture.driverToken}`)
      .send({ dropoffOtp: fixture.otp });

    expect(res.status).toBe(200);
    expect(res.body.data.deliveredLegs).toBe(2);

    const legs = await prisma.order.findMany({
      where: { orderGroupId: fixture.groupId },
    });
    expect(legs.every((l) => l.status === 'DELIVERED')).toBe(true);
    expect(legs.every((l) => l.deliveredAt != null)).toBe(true);
    // COD paid-on-delivery: payment status flips to PAID at the same
    // moment delivery completes.
    expect(legs.every((l) => l.paymentStatus === 'PAID')).toBe(true);

    const group = await prisma.orderGroup.findUnique({
      where: { id: fixture.groupId },
    });
    expect(group?.status).toBe('DELIVERED');
  });

  it('refuses with 400 when any leg is still pre-pickup', async () => {
    const fixture = await readyGroupForDelivery();
    // Roll one leg back to DRIVER_ASSIGNED so delivery is premature.
    await prisma.order.update({
      where: { id: fixture.legs[0]!.id },
      data: { status: 'DRIVER_ASSIGNED', pickedUpAt: null },
    });
    const res = await request(app)
      .put(`/api/v1/drivers/order-groups/${fixture.groupId}/deliver`)
      .set('Authorization', `Bearer ${fixture.driverToken}`)
      .send({ dropoffOtp: fixture.otp });
    expect(res.status).toBe(400);

    // Nothing was mutated.
    const legs = await prisma.order.findMany({
      where: { orderGroupId: fixture.groupId },
    });
    expect(legs.every((l) => l.status !== 'DELIVERED')).toBe(true);
  });

  it('refuses with 400 when the OTP is wrong', async () => {
    const fixture = await readyGroupForDelivery();
    const res = await request(app)
      .put(`/api/v1/drivers/order-groups/${fixture.groupId}/deliver`)
      .set('Authorization', `Bearer ${fixture.driverToken}`)
      .send({ dropoffOtp: '0000' });
    expect(res.status).toBe(400);

    const legs = await prisma.order.findMany({
      where: { orderGroupId: fixture.groupId },
    });
    expect(legs.every((l) => l.status === 'PICKED_UP')).toBe(true);
  });

  it('refuses with 403 when a different driver tries to deliver', async () => {
    const fixture = await readyGroupForDelivery();
    const { user: otherDriverUser } = await createDriver({ status: 'ONLINE' });
    const otherToken = tokenFor(otherDriverUser);
    const res = await request(app)
      .put(`/api/v1/drivers/order-groups/${fixture.groupId}/deliver`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ dropoffOtp: fixture.otp });
    expect(res.status).toBe(403);
  });
});

describe('PUT /api/v1/drivers/orders/:id/deliver — refuses grouped legs', () => {
  it('returns 409 when called on a child of an OrderGroup', async () => {
    const fixture = await readyGroupForDelivery();
    const legId = fixture.legs[0]!.id;
    const res = await request(app)
      .put(`/api/v1/drivers/orders/${legId}/deliver`)
      .set('Authorization', `Bearer ${fixture.driverToken}`)
      .send({ dropoffOtp: fixture.otp });
    expect(res.status).toBe(409);
    // No state change.
    const leg = await prisma.order.findUnique({ where: { id: legId } });
    expect(leg?.status).toBe('PICKED_UP');
  });
});
