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
jest.mock('../src/services/driver.service', () => ({
  assignDriverForOrder: jest.fn().mockResolvedValue(undefined),
}));

import request from 'supertest';
import { createTestApp } from './helpers/app';
import { prisma } from '../src/config/prisma';
import {
  createDriver,
  createStoreOwner,
  createAddress,
  createOrder,
  loginAs,
  tokenFor,
} from './helpers/factory';

const app = createTestApp();

describe('POST /api/v1/drivers/register', () => {
  it('creates a driver in PENDING_APPROVAL and updates user role', async () => {
    const { token, user } = await loginAs('CUSTOMER');
    const res = await request(app)
      .post('/api/v1/drivers/register')
      .set('Authorization', `Bearer ${token}`)
      .send({
        vehicleType: 'BIKE',
        vehicleNumber: 'DL01XX1234',
        licenseNumber: 'LIC-9988',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('PENDING_APPROVAL');
    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updated?.role).toBe('DRIVER');
  });

  it('returns 409 when already a driver', async () => {
    const { user } = await createDriver();
    const token = tokenFor({ id: user.id, role: 'DRIVER', phone: user.phone });
    const res = await request(app)
      .post('/api/v1/drivers/register')
      .set('Authorization', `Bearer ${token}`)
      .send({ vehicleType: 'BIKE', vehicleNumber: 'X', licenseNumber: 'LIC' });
    expect(res.status).toBe(409);
  });
});

describe('PUT /api/v1/drivers/status', () => {
  it('approved driver can switch to ONLINE', async () => {
    const { user } = await createDriver({ status: 'OFFLINE' });
    const token = tokenFor({ id: user.id, role: 'DRIVER', phone: user.phone });
    const res = await request(app)
      .put('/api/v1/drivers/status')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'ONLINE' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ONLINE');
  });

  it('PENDING_APPROVAL driver gets 403', async () => {
    const { user } = await createDriver({ status: 'PENDING_APPROVAL' });
    const token = tokenFor({ id: user.id, role: 'DRIVER', phone: user.phone });
    const res = await request(app)
      .put('/api/v1/drivers/status')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'ONLINE' });
    expect(res.status).toBe(403);
  });

  it('SUSPENDED driver gets 403', async () => {
    const { user } = await createDriver({ status: 'SUSPENDED' });
    const token = tokenFor({ id: user.id, role: 'DRIVER', phone: user.phone });
    const res = await request(app)
      .put('/api/v1/drivers/status')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'ONLINE' });
    expect(res.status).toBe(403);
  });
});

describe('PUT /api/v1/drivers/location', () => {
  it('updates currentLat/currentLng', async () => {
    const { user, driver } = await createDriver({ status: 'ONLINE' });
    const token = tokenFor({ id: user.id, role: 'DRIVER', phone: user.phone });
    const res = await request(app)
      .put('/api/v1/drivers/location')
      .set('Authorization', `Bearer ${token}`)
      .send({ lat: 19.07, lng: 72.87 });
    expect(res.status).toBe(200);
    expect(res.body.data.currentLat).toBeCloseTo(19.07);
    expect(res.body.data.currentLng).toBeCloseTo(72.87);
    const reloaded = await prisma.driver.findUnique({ where: { id: driver.id } });
    expect(reloaded?.currentLat).toBeCloseTo(19.07);
  });

  it('rejects out-of-range coordinates', async () => {
    const { user } = await createDriver({ status: 'ONLINE' });
    const token = tokenFor({ id: user.id, role: 'DRIVER', phone: user.phone });
    const res = await request(app)
      .put('/api/v1/drivers/location')
      .set('Authorization', `Bearer ${token}`)
      .send({ lat: 200, lng: 0 });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/drivers/earnings', () => {
  it('returns aggregated earnings', async () => {
    const { user, driver } = await createDriver({ status: 'ONLINE' });
    await prisma.driver.update({
      where: { id: driver.id },
      data: { totalEarnings: 500 },
    });
    const token = tokenFor({ id: user.id, role: 'DRIVER', phone: user.phone });
    const res = await request(app)
      .get('/api/v1/drivers/earnings')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.totalEarnings).toBe(500);
    expect(res.body.data.totalDeliveries).toBe(0);
    expect(res.body.data.todayDeliveries).toBe(0);
  });
});

describe('PUT /api/v1/drivers/orders/:orderId/accept', () => {
  it('assigned driver can accept', async () => {
    const { user, driver } = await createDriver({ status: 'ONLINE' });
    const token = tokenFor({ id: user.id, role: 'DRIVER', phone: user.phone });
    const { user: customer } = await loginAs('CUSTOMER');
    const addr = await createAddress(customer.id);
    const { store } = await createStoreOwner();
    const order = await createOrder({
      customerId: customer.id,
      storeId: store.id,
      addressId: addr.id,
      driverId: driver.id,
      status: 'DRIVER_ASSIGNED',
    });

    const res = await request(app)
      .put(`/api/v1/drivers/orders/${order.id}/accept`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it('non-assigned driver gets 403', async () => {
    const { user, driver } = await createDriver({ status: 'ONLINE' });
    const token = tokenFor({ id: user.id, role: 'DRIVER', phone: user.phone });
    const { user: other } = await createDriver({ status: 'ONLINE' });
    const { user: customer } = await loginAs('CUSTOMER');
    const addr = await createAddress(customer.id);
    const { store } = await createStoreOwner();

    const otherDriverRow = await prisma.driver.findUnique({ where: { userId: other.id } });
    const order = await createOrder({
      customerId: customer.id,
      storeId: store.id,
      addressId: addr.id,
      driverId: otherDriverRow!.id,
      status: 'DRIVER_ASSIGNED',
    });

    const res = await request(app)
      .put(`/api/v1/drivers/orders/${order.id}/accept`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    // sanity: confirm we aren't tripping on the assigned driver's id
    expect(driver.id).not.toBe(otherDriverRow!.id);
  });

  it('cannot accept a PICKED_UP order', async () => {
    const { user, driver } = await createDriver({ status: 'ONLINE' });
    const token = tokenFor({ id: user.id, role: 'DRIVER', phone: user.phone });
    const { user: customer } = await loginAs('CUSTOMER');
    const addr = await createAddress(customer.id);
    const { store } = await createStoreOwner();
    const order = await createOrder({
      customerId: customer.id,
      storeId: store.id,
      addressId: addr.id,
      driverId: driver.id,
      status: 'PICKED_UP',
    });
    const res = await request(app)
      .put(`/api/v1/drivers/orders/${order.id}/accept`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/v1/drivers/orders/:orderId/pickup', () => {
  it('moves DRIVER_ASSIGNED → PICKED_UP', async () => {
    const { user, driver } = await createDriver({ status: 'ONLINE' });
    const token = tokenFor({ id: user.id, role: 'DRIVER', phone: user.phone });
    const { user: customer } = await loginAs('CUSTOMER');
    const addr = await createAddress(customer.id);
    const { store } = await createStoreOwner();
    const order = await createOrder({
      customerId: customer.id,
      storeId: store.id,
      addressId: addr.id,
      driverId: driver.id,
      status: 'DRIVER_ASSIGNED',
    });

    const res = await request(app)
      .put(`/api/v1/drivers/orders/${order.id}/pickup`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('PICKED_UP');
  });
});

describe('PUT /api/v1/drivers/orders/:orderId/deliver', () => {
  it('moves PICKED_UP → DELIVERED and increments earnings', async () => {
    const { user, driver } = await createDriver({ status: 'ONLINE' });
    const token = tokenFor({ id: user.id, role: 'DRIVER', phone: user.phone });
    const { user: customer } = await loginAs('CUSTOMER');
    const addr = await createAddress(customer.id);
    const { store } = await createStoreOwner();
    const order = await createOrder({
      customerId: customer.id,
      storeId: store.id,
      addressId: addr.id,
      driverId: driver.id,
      status: 'PICKED_UP',
    });

    const res = await request(app)
      .put(`/api/v1/drivers/orders/${order.id}/deliver`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('DELIVERED');
    const updated = await prisma.driver.findUnique({ where: { id: driver.id } });
    expect(updated!.totalEarnings).toBeGreaterThan(0);
  });

  it('cannot deliver if not PICKED_UP', async () => {
    const { user, driver } = await createDriver({ status: 'ONLINE' });
    const token = tokenFor({ id: user.id, role: 'DRIVER', phone: user.phone });
    const { user: customer } = await loginAs('CUSTOMER');
    const addr = await createAddress(customer.id);
    const { store } = await createStoreOwner();
    const order = await createOrder({
      customerId: customer.id,
      storeId: store.id,
      addressId: addr.id,
      driverId: driver.id,
      status: 'DRIVER_ASSIGNED',
    });
    const res = await request(app)
      .put(`/api/v1/drivers/orders/${order.id}/deliver`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/v1/drivers/orders/:orderId/reject', () => {
  it('frees the order for reassignment', async () => {
    const { user, driver } = await createDriver({ status: 'ONLINE' });
    const token = tokenFor({ id: user.id, role: 'DRIVER', phone: user.phone });
    const { user: customer } = await loginAs('CUSTOMER');
    const addr = await createAddress(customer.id);
    const { store } = await createStoreOwner();
    const order = await createOrder({
      customerId: customer.id,
      storeId: store.id,
      addressId: addr.id,
      driverId: driver.id,
      status: 'DRIVER_ASSIGNED',
    });

    const res = await request(app)
      .put(`/api/v1/drivers/orders/${order.id}/reject`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const reloaded = await prisma.order.findUnique({ where: { id: order.id } });
    expect(reloaded?.driverId).toBeNull();
    expect(reloaded?.status).toBe('STORE_ACCEPTED');
  });
});
