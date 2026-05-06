/**
 * Builds a fresh Express app (without socket.io / workers) for use in supertest.
 * Mirrors src/index.ts route registrations.
 */
import express, { Express } from 'express';
import authRouter from '../../src/routes/auth.routes';
import storesRouter from '../../src/routes/stores.routes';
import itemsRouter from '../../src/routes/items.routes';
import ordersRouter from '../../src/routes/orders.routes';
import driversRouter from '../../src/routes/drivers.routes';
import adminRouter from '../../src/routes/admin.routes';
import notificationsRouter from '../../src/routes/notifications.routes';
import { errorHandler } from '../../src/middleware/error.middleware';

export function createTestApp(): Express {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/stores', storesRouter);
  app.use('/api/v1/items', itemsRouter);
  app.use('/api/v1/orders', ordersRouter);
  app.use('/api/v1/drivers', driversRouter);
  app.use('/api/v1/admin', adminRouter);
  app.use('/api/v1/notifications', notificationsRouter);

  app.use((_req, res) => {
    res.status(404).json({ success: false, error: 'Route not found' });
  });

  app.use(errorHandler);

  return app;
}
