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
import {
  createAddress,
  createDriver,
  createOrder,
  createStoreOwner,
  loginAs,
  tokenFor,
} from './helpers/factory';

const app = createTestApp();

async function adminToken() {
  const { token } = await loginAs('ADMIN');
  return token;
}

describe('GET /api/v1/admin/users', () => {
  it('returns 403 for non-admin', async () => {
    const { token } = await loginAs('CUSTOMER');
    const res = await request(app)
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns paginated users for ADMIN', async () => {
    const token = await adminToken();
    await loginAs('CUSTOMER');
    await loginAs('CUSTOMER');

    const res = await request(app)
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.users.length).toBeGreaterThanOrEqual(3); // 2 customers + 1 admin
  });
});

describe('GET /api/v1/admin/stores', () => {
  it('filters by status=PENDING_APPROVAL', async () => {
    const token = await adminToken();
    await createStoreOwner({ storeStatus: 'PENDING_APPROVAL' });
    await createStoreOwner({ storeStatus: 'ACTIVE' });

    const res = await request(app)
      .get('/api/v1/admin/stores')
      .query({ status: 'PENDING_APPROVAL' })
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.stores.length).toBe(1);
    expect(res.body.data.stores[0].status).toBe('PENDING_APPROVAL');
  });

  it('filters by status=ACTIVE and includes _count', async () => {
    const token = await adminToken();
    await createStoreOwner({ storeStatus: 'ACTIVE' });

    const res = await request(app)
      .get('/api/v1/admin/stores')
      .query({ status: 'ACTIVE' })
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.stores[0]._count).toBeDefined();
  });
});

describe('GET /api/v1/admin/drivers', () => {
  it('filters by status=PENDING_APPROVAL with nested user', async () => {
    const token = await adminToken();
    await createDriver({ status: 'PENDING_APPROVAL' });
    await createDriver({ status: 'ONLINE' });

    const res = await request(app)
      .get('/api/v1/admin/drivers')
      .query({ status: 'PENDING_APPROVAL' })
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.drivers.length).toBe(1);
    expect(res.body.data.drivers[0].user).toBeDefined();
  });
});

describe('PUT /api/v1/admin/stores/:id/approve', () => {
  it('PENDING → ACTIVE', async () => {
    const token = await adminToken();
    const { store } = await createStoreOwner({ storeStatus: 'PENDING_APPROVAL' });
    const res = await request(app)
      .put(`/api/v1/admin/stores/${store.id}/approve`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ACTIVE');
  });

  it('returns 404 for unknown store', async () => {
    const token = await adminToken();
    const res = await request(app)
      .put('/api/v1/admin/stores/clz0000000000000000000000/approve')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/v1/admin/stores/:id/suspend', () => {
  it('ACTIVE → SUSPENDED, isOpen=false', async () => {
    const token = await adminToken();
    const { store } = await createStoreOwner({ isOpen: true });
    const res = await request(app)
      .put(`/api/v1/admin/stores/${store.id}/suspend`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('SUSPENDED');
    expect(res.body.data.isOpen).toBe(false);
  });
});

describe('PUT /api/v1/admin/drivers/:id/approve', () => {
  it('PENDING → OFFLINE', async () => {
    const token = await adminToken();
    const { driver } = await createDriver({ status: 'PENDING_APPROVAL' });
    const res = await request(app)
      .put(`/api/v1/admin/drivers/${driver.id}/approve`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('OFFLINE');
  });
});

describe('PUT /api/v1/admin/drivers/:id/suspend', () => {
  it('toggles OFFLINE/SUSPENDED', async () => {
    const token = await adminToken();
    const { driver } = await createDriver({ status: 'OFFLINE' });
    const res1 = await request(app)
      .put(`/api/v1/admin/drivers/${driver.id}/suspend`)
      .set('Authorization', `Bearer ${token}`);
    expect(res1.body.data.status).toBe('SUSPENDED');
    const res2 = await request(app)
      .put(`/api/v1/admin/drivers/${driver.id}/suspend`)
      .set('Authorization', `Bearer ${token}`);
    expect(res2.body.data.status).toBe('OFFLINE');
  });
});

describe('GET /api/v1/admin/orders', () => {
  it('returns paginated orders', async () => {
    const token = await adminToken();
    const { user: customer } = await loginAs('CUSTOMER');
    const addr = await createAddress(customer.id);
    const { store } = await createStoreOwner();
    await createOrder({ customerId: customer.id, storeId: store.id, addressId: addr.id });

    const res = await request(app)
      .get('/api/v1/admin/orders')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.orders.length).toBe(1);
  });
});

describe('GET /api/v1/admin/analytics', () => {
  it('returns today metrics, activeDrivers, activeStores', async () => {
    const token = await adminToken();
    await createDriver({ status: 'ONLINE' });
    await createStoreOwner({ isOpen: true });
    const { user: customer } = await loginAs('CUSTOMER');
    const addr = await createAddress(customer.id);
    const { store } = await createStoreOwner();
    await createOrder({ customerId: customer.id, storeId: store.id, addressId: addr.id });

    const res = await request(app)
      .get('/api/v1/admin/analytics')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.today.orders).toBeGreaterThanOrEqual(1);
    expect(res.body.data.today.gmv).toBeGreaterThan(0);
    expect(res.body.data.activeDrivers).toBe(1);
    expect(res.body.data.activeStores).toBe(2);
  });
});

describe('PUT /api/v1/admin/users/:id/suspend', () => {
  it('toggles isActive', async () => {
    const token = await adminToken();
    const { user } = await loginAs('CUSTOMER');
    const r1 = await request(app)
      .put(`/api/v1/admin/users/${user.id}/suspend`)
      .set('Authorization', `Bearer ${token}`);
    expect(r1.status).toBe(200);
    expect(r1.body.data.isActive).toBe(false);
    const r2 = await request(app)
      .put(`/api/v1/admin/users/${user.id}/suspend`)
      .set('Authorization', `Bearer ${token}`);
    expect(r2.body.data.isActive).toBe(true);
  });
});
