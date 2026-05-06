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
  createStoreOwner,
  createItem,
  createAddress,
  createOrder,
  createDriver,
  loginAs,
  tokenFor,
} from './helpers/factory';

const app = createTestApp();

async function setupCustomerWithAddress() {
  const { token, user } = await loginAs('CUSTOMER');
  const address = await createAddress(user.id);
  return { token, user, address };
}

describe('POST /api/v1/orders', () => {
  it('creates an order in PENDING with correct totals', async () => {
    const { token, user, address } = await setupCustomerWithAddress();
    const { store } = await createStoreOwner();
    const item = await createItem(store.id, { price: 50, stockQty: 10 });

    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ itemId: item.id, qty: 2 }],
        deliveryAddressId: address.id,
        paymentMethod: 'CASH_ON_DELIVERY',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('PENDING');
    expect(res.body.data.subtotal).toBe(100);
    expect(res.body.data.deliveryFee).toBe(30);
    expect(res.body.data.total).toBe(130);
    expect(res.body.data.commission).toBe(5);
    expect(res.body.data.customerId).toBe(user.id);
    expect(res.body.data.items.length).toBe(1);
  });

  it('returns 400 with empty items array', async () => {
    const { token, address } = await setupCustomerWithAddress();
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [],
        deliveryAddressId: address.id,
        paymentMethod: 'CASH_ON_DELIVERY',
      });
    expect(res.status).toBe(400);
  });

  it('returns 400 when an item id does not exist', async () => {
    const { token, address } = await setupCustomerWithAddress();
    // Use a syntactically valid CUID-shaped id
    const fakeItemId = 'clz0000000000000000000000';
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ itemId: fakeItemId, qty: 1 }],
        deliveryAddressId: address.id,
        paymentMethod: 'CASH_ON_DELIVERY',
      });
    expect(res.status).toBe(400);
  });

  it('returns 400 when stock is insufficient', async () => {
    const { token, address } = await setupCustomerWithAddress();
    const { store } = await createStoreOwner();
    const item = await createItem(store.id, { stockQty: 1 });
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ itemId: item.id, qty: 5 }],
        deliveryAddressId: address.id,
        paymentMethod: 'CASH_ON_DELIVERY',
      });
    expect(res.status).toBe(400);
  });

  it('returns 404 when delivery address does not belong to user', async () => {
    const { token } = await setupCustomerWithAddress();
    const { user: other } = await loginAs('CUSTOMER');
    const otherAddress = await createAddress(other.id);
    const { store } = await createStoreOwner();
    const item = await createItem(store.id);
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ itemId: item.id, qty: 1 }],
        deliveryAddressId: otherAddress.id,
        paymentMethod: 'CASH_ON_DELIVERY',
      });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/orders', () => {
  it('customer sees only their own orders', async () => {
    const { token, user, address } = await setupCustomerWithAddress();
    const { store } = await createStoreOwner();
    await createOrder({ customerId: user.id, storeId: store.id, addressId: address.id });

    const { user: other } = await loginAs('CUSTOMER');
    const otherAddr = await createAddress(other.id);
    await createOrder({ customerId: other.id, storeId: store.id, addressId: otherAddr.id });

    const res = await request(app)
      .get('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.orders.length).toBe(1);
    expect(res.body.data.orders[0].customerId).toBe(user.id);
  });

  it('store owner sees only their store orders', async () => {
    const { user: ownerUser, store } = await createStoreOwner();
    const ownerToken = tokenFor({
      id: ownerUser.id,
      role: 'STORE_OWNER',
      phone: ownerUser.phone,
    });
    const { user: customer } = await loginAs('CUSTOMER');
    const addr = await createAddress(customer.id);

    await createOrder({ customerId: customer.id, storeId: store.id, addressId: addr.id });

    const { store: otherStore } = await createStoreOwner();
    await createOrder({ customerId: customer.id, storeId: otherStore.id, addressId: addr.id });

    const res = await request(app)
      .get('/api/v1/orders')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.orders.length).toBe(1);
    expect(res.body.data.orders[0].storeId).toBe(store.id);
  });

  it('driver sees only their assigned deliveries', async () => {
    const { user: driverUser, driver } = await createDriver();
    const driverToken = tokenFor({
      id: driverUser.id,
      role: 'DRIVER',
      phone: driverUser.phone,
    });
    const { user: customer } = await loginAs('CUSTOMER');
    const addr = await createAddress(customer.id);
    const { store } = await createStoreOwner();

    await createOrder({
      customerId: customer.id,
      storeId: store.id,
      addressId: addr.id,
      driverId: driver.id,
    });
    // Order without driver
    await createOrder({ customerId: customer.id, storeId: store.id, addressId: addr.id });

    const res = await request(app)
      .get('/api/v1/orders')
      .set('Authorization', `Bearer ${driverToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.orders.length).toBe(1);
    expect(res.body.data.orders[0].driverId).toBe(driver.id);
  });
});

describe('GET /api/v1/orders/:id', () => {
  it('owner of order can view full order detail', async () => {
    const { token, user, address } = await setupCustomerWithAddress();
    const { store } = await createStoreOwner();
    const order = await createOrder({
      customerId: user.id,
      storeId: store.id,
      addressId: address.id,
    });
    const res = await request(app)
      .get(`/api/v1/orders/${order.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(order.id);
  });

  it('returns 404 for unknown id', async () => {
    const { token } = await setupCustomerWithAddress();
    const res = await request(app)
      .get('/api/v1/orders/clz0000000000000000000000')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('returns 403 when caller has no relation to the order', async () => {
    const { user: customer } = await loginAs('CUSTOMER');
    const addr = await createAddress(customer.id);
    const { store } = await createStoreOwner();
    const order = await createOrder({
      customerId: customer.id,
      storeId: store.id,
      addressId: addr.id,
    });

    const { token: otherToken } = await loginAs('CUSTOMER');
    const res = await request(app)
      .get(`/api/v1/orders/${order.id}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(403);
  });
});

describe('PUT /api/v1/orders/:id/accept', () => {
  it('store owner accepts a PENDING order', async () => {
    const { user: ownerUser, store } = await createStoreOwner();
    const ownerToken = tokenFor({
      id: ownerUser.id,
      role: 'STORE_OWNER',
      phone: ownerUser.phone,
    });
    const { user: customer } = await loginAs('CUSTOMER');
    const addr = await createAddress(customer.id);
    const order = await createOrder({
      customerId: customer.id,
      storeId: store.id,
      addressId: addr.id,
    });

    const res = await request(app)
      .put(`/api/v1/orders/${order.id}/accept`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('STORE_ACCEPTED');
  });

  it('non-owner gets 403', async () => {
    const { store } = await createStoreOwner();
    const { user: customer } = await loginAs('CUSTOMER');
    const addr = await createAddress(customer.id);
    const order = await createOrder({
      customerId: customer.id,
      storeId: store.id,
      addressId: addr.id,
    });

    const { user: other } = await createStoreOwner();
    const otherToken = tokenFor({
      id: other.id,
      role: 'STORE_OWNER',
      phone: other.phone,
    });

    const res = await request(app)
      .put(`/api/v1/orders/${order.id}/accept`)
      .set('Authorization', `Bearer ${otherToken}`);

    expect(res.status).toBe(403);
  });
});

describe('PUT /api/v1/orders/:id/reject', () => {
  it('store owner rejects a PENDING order', async () => {
    const { user: ownerUser, store } = await createStoreOwner();
    const ownerToken = tokenFor({
      id: ownerUser.id,
      role: 'STORE_OWNER',
      phone: ownerUser.phone,
    });
    const { user: customer } = await loginAs('CUSTOMER');
    const addr = await createAddress(customer.id);
    const order = await createOrder({
      customerId: customer.id,
      storeId: store.id,
      addressId: addr.id,
    });

    const res = await request(app)
      .put(`/api/v1/orders/${order.id}/reject`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ reason: 'Out of stock' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('REJECTED');
    expect(res.body.data.rejectionReason).toBe('Out of stock');
  });
});

describe('PUT /api/v1/orders/:id/cancel', () => {
  it('customer cancels a PENDING order', async () => {
    const { token, user, address } = await setupCustomerWithAddress();
    const { store } = await createStoreOwner();
    const order = await createOrder({
      customerId: user.id,
      storeId: store.id,
      addressId: address.id,
    });

    const res = await request(app)
      .put(`/api/v1/orders/${order.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Changed my mind' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CANCELLED');
  });

  it('cannot cancel a DELIVERED order', async () => {
    const { token, user, address } = await setupCustomerWithAddress();
    const { store } = await createStoreOwner();
    const order = await createOrder({
      customerId: user.id,
      storeId: store.id,
      addressId: address.id,
      status: 'DELIVERED',
    });

    const res = await request(app)
      .put(`/api/v1/orders/${order.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Too late' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/orders/:id/rate', () => {
  it('creates a rating, updates store and driver aggregates', async () => {
    const { token, user, address } = await setupCustomerWithAddress();
    const { store } = await createStoreOwner();
    const { driver } = await createDriver();
    const order = await createOrder({
      customerId: user.id,
      storeId: store.id,
      addressId: address.id,
      driverId: driver.id,
      status: 'DELIVERED',
    });

    const res = await request(app)
      .post(`/api/v1/orders/${order.id}/rate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ storeRating: 5, driverRating: 4, storeComment: 'Great', driverComment: 'Fast' });

    expect(res.status).toBe(201);
    const updatedStore = await prisma.store.findUnique({ where: { id: store.id } });
    expect(updatedStore?.totalRatings).toBe(1);
    expect(updatedStore?.rating).toBe(5);
    const updatedDriver = await prisma.driver.findUnique({ where: { id: driver.id } });
    expect(updatedDriver?.totalRatings).toBe(1);
    expect(updatedDriver?.rating).toBe(4);
  });

  it('returns 409 when rating twice', async () => {
    const { token, user, address } = await setupCustomerWithAddress();
    const { store } = await createStoreOwner();
    const order = await createOrder({
      customerId: user.id,
      storeId: store.id,
      addressId: address.id,
      status: 'DELIVERED',
    });
    await prisma.orderRating.create({
      data: { orderId: order.id, customerId: user.id, storeRating: 5 },
    });

    const res = await request(app)
      .post(`/api/v1/orders/${order.id}/rate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ storeRating: 4 });

    expect(res.status).toBe(409);
  });

  it('returns 400 when order is not delivered', async () => {
    const { token, user, address } = await setupCustomerWithAddress();
    const { store } = await createStoreOwner();
    const order = await createOrder({
      customerId: user.id,
      storeId: store.id,
      addressId: address.id,
      status: 'PENDING',
    });
    const res = await request(app)
      .post(`/api/v1/orders/${order.id}/rate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ storeRating: 5 });
    expect(res.status).toBe(400);
  });
});
