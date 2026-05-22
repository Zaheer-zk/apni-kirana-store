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
jest.mock('../src/services/email.service', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
}));

import request from 'supertest';
import { createTestApp } from './helpers/app';
import { prisma } from '../src/config/prisma';
import { sendPasswordResetEmail } from '../src/services/email.service';
import {
  createAddress,
  createDriver,
  createOrder,
  createStoreOwner,
  createUser,
  loginAs,
  tokenFor,
} from './helpers/factory';

const mockSendResetEmail = sendPasswordResetEmail as jest.Mock;

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

describe('POST /api/v1/admin/users', () => {
  const newUser = {
    name: 'Created By Admin',
    phone: '9700000001',
    email: 'admin.made@example.com',
    username: 'adminmade',
    role: 'STORE_OWNER' as const,
  };

  it('creates a user with a temp password and mustChangePassword', async () => {
    const token = await adminToken();
    const res = await request(app)
      .post('/api/v1/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send(newUser);

    expect(res.status).toBe(201);
    expect(res.body.data.tempPassword).toMatch(/^[A-Za-z0-9]{10}$/);
    expect(res.body.data.user.passwordHash).toBeUndefined();

    const dbUser = await prisma.user.findUnique({ where: { phone: newUser.phone } });
    expect(dbUser!.mustChangePassword).toBe(true);
    expect(dbUser!.phoneVerified).toBe(true);
    expect(dbUser!.roles).toEqual(['STORE_OWNER']);
  });

  it('adds the role to an existing account when the phone is already in use', async () => {
    const token = await adminToken();
    // newUser.role is STORE_OWNER; the existing account is a CUSTOMER.
    const existing = await createUser({ phone: newUser.phone, role: 'CUSTOMER', roles: ['CUSTOMER'] });
    const res = await request(app)
      .post('/api/v1/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send(newUser);

    expect(res.status).toBe(200);
    const dbUser = await prisma.user.findUnique({ where: { id: existing.id } });
    expect(dbUser!.roles).toEqual(expect.arrayContaining(['CUSTOMER', 'STORE_OWNER']));
  });

  it('returns 409 when the number belongs to a suspended account', async () => {
    const token = await adminToken();
    await createUser({ phone: newUser.phone, role: 'CUSTOMER', roles: ['CUSTOMER'], isActive: false });
    const res = await request(app)
      .post('/api/v1/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send(newUser);
    expect(res.status).toBe(409);
  });

  it('returns 409 when the number already holds that exact role', async () => {
    const token = await adminToken();
    await createUser({ phone: newUser.phone, role: 'STORE_OWNER', roles: ['STORE_OWNER'] });
    const res = await request(app)
      .post('/api/v1/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send(newUser);
    expect(res.status).toBe(409);
  });

  it('returns 403 for a non-admin caller', async () => {
    const { token } = await loginAs('CUSTOMER');
    const res = await request(app)
      .post('/api/v1/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send(newUser);
    expect(res.status).toBe(403);
  });

  it('lets the super admin create an ADMIN account', async () => {
    const su = await createUser({ role: 'ADMIN', roles: ['ADMIN'], isSuperAdmin: true });
    const res = await request(app)
      .post('/api/v1/admin/users')
      .set('Authorization', `Bearer ${tokenFor(su)}`)
      .send({ ...newUser, phone: '9700000099', email: 'made.admin@example.com', username: 'madeadmin', role: 'ADMIN' });

    expect(res.status).toBe(201);
    expect(res.body.data.tempPassword).toBeTruthy();
    const dbUser = await prisma.user.findUnique({ where: { phone: '9700000099' } });
    expect(dbUser!.role).toBe('ADMIN');
    expect(dbUser!.isSuperAdmin).toBe(false);
    expect(dbUser!.mustChangePassword).toBe(true);
  });

  it('forbids a regular admin from creating an ADMIN account', async () => {
    const token = await adminToken(); // a plain ADMIN, not super admin
    const res = await request(app)
      .post('/api/v1/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...newUser, phone: '9700000098', email: 'nope@example.com', username: 'nopeadmin', role: 'ADMIN' });
    expect(res.status).toBe(403);
  });
});

describe('PUT /api/v1/admin/users/:id', () => {
  it('edits a user and can grant a role', async () => {
    const token = await adminToken();
    const user = await createUser({ role: 'CUSTOMER', roles: ['CUSTOMER'] });
    const res = await request(app)
      .put(`/api/v1/admin/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Renamed', roles: ['CUSTOMER', 'DRIVER'] });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Renamed');
    expect(res.body.data.roles).toEqual(expect.arrayContaining(['CUSTOMER', 'DRIVER']));
  });

  it('refuses to edit an ADMIN account', async () => {
    const token = await adminToken();
    const otherAdmin = await createUser({ role: 'ADMIN', roles: ['ADMIN'] });
    const res = await request(app)
      .put(`/api/v1/admin/users/${otherAdmin.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Nope' });
    expect(res.status).toBe(403);
  });

  it('returns 404 for an unknown user', async () => {
    const token = await adminToken();
    const res = await request(app)
      .put('/api/v1/admin/users/does-not-exist')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'X' });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/admin/users/:id/reset-credentials', () => {
  beforeEach(() => mockSendResetEmail.mockClear());

  it('emails a reset link for a user with an email', async () => {
    const token = await adminToken();
    const user = await createUser({ email: 'reset.target@example.com' });
    const res = await request(app)
      .post(`/api/v1/admin/users/${user.id}/reset-credentials`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(mockSendResetEmail).toHaveBeenCalledTimes(1);
    expect(await prisma.passwordResetToken.count({ where: { userId: user.id } })).toBe(1);
  });

  it('returns 400 when the user has no email on file', async () => {
    const token = await adminToken();
    const user = await createUser();
    const res = await request(app)
      .post(`/api/v1/admin/users/${user.id}/reset-credentials`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/v1/admin/stores/:id', () => {
  it('updates a store’s details', async () => {
    const token = await adminToken();
    const { store } = await createStoreOwner();
    const res = await request(app)
      .put(`/api/v1/admin/stores/${store.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Renamed Store', closeTime: '23:30' });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Renamed Store');
    expect(res.body.data.closeTime).toBe('23:30');
  });

  it('returns 404 for an unknown store', async () => {
    const token = await adminToken();
    const res = await request(app)
      .put('/api/v1/admin/stores/does-not-exist')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'X store' });
    expect(res.status).toBe(404);
  });

  it('returns 403 for a non-admin caller', async () => {
    const { token } = await loginAs('CUSTOMER');
    const { store } = await createStoreOwner();
    const res = await request(app)
      .put(`/api/v1/admin/stores/${store.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Hacked' });
    expect(res.status).toBe(403);
  });
});

describe('PUT /api/v1/admin/drivers/:id', () => {
  it('updates a driver’s vehicle details', async () => {
    const token = await adminToken();
    const { driver } = await createDriver();
    const res = await request(app)
      .put(`/api/v1/admin/drivers/${driver.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ vehicleNumber: 'DL09ZZ9999', vehicleType: 'SCOOTER' });

    expect(res.status).toBe(200);
    expect(res.body.data.vehicleNumber).toBe('DL09ZZ9999');
    expect(res.body.data.vehicleType).toBe('SCOOTER');
  });

  it('returns 404 for an unknown driver', async () => {
    const token = await adminToken();
    const res = await request(app)
      .put('/api/v1/admin/drivers/does-not-exist')
      .set('Authorization', `Bearer ${token}`)
      .send({ vehicleNumber: 'DL09ZZ9999' });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/admin/stores/:id', () => {
  it('returns store detail with owner, items and orders', async () => {
    const token = await adminToken();
    const { store } = await createStoreOwner();
    const res = await request(app)
      .get(`/api/v1/admin/stores/${store.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.store.id).toBe(store.id);
    expect(res.body.data.store.ownerName).toBeDefined();
    expect(Array.isArray(res.body.data.items)).toBe(true);
    expect(Array.isArray(res.body.data.recentOrders)).toBe(true);
  });

  it('returns 404 for an unknown store', async () => {
    const token = await adminToken();
    const res = await request(app)
      .get('/api/v1/admin/stores/does-not-exist')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
