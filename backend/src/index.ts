import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { Server } from 'socket.io';

import { config } from './config/env';
import { errorHandler } from './middleware/error.middleware';
import { setupSocket } from './socket';
import { startWorkers } from './queues';

// ─── Route Imports ─────────────────────────────────────────────────────────────
import authRouter from './routes/auth.routes';
import storesRouter from './routes/stores.routes';
import itemsRouter from './routes/items.routes';
import ordersRouter from './routes/orders.routes';
import driversRouter from './routes/drivers.routes';
import adminRouter from './routes/admin.routes';
import notificationsRouter from './routes/notifications.routes';
import addressesRouter from './routes/addresses.routes';
import usersRouter from './routes/users.routes';

// ─── App Setup ────────────────────────────────────────────────────────────────

const app = express();
const server = http.createServer(app);

// ─── Socket.io ────────────────────────────────────────────────────────────────

export const io = new Server(server, {
  cors: {
    origin: config.cors.origin,
    methods: ['GET', 'POST'],
  },
});

setupSocket(io);

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(helmet());
app.use(
  cors({
    origin: config.cors.origin,
    credentials: true,
  }),
);
app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/stores', storesRouter);
app.use('/api/v1/items', itemsRouter);
app.use('/api/v1/orders', ordersRouter);
app.use('/api/v1/drivers', driversRouter);
app.use('/api/v1/admin', adminRouter);
app.use('/api/v1/notifications', notificationsRouter);
app.use('/api/v1/addresses', addressesRouter);
app.use('/api/v1/users', usersRouter);

// ─── 404 Handler ──────────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────

app.use(errorHandler);

// ─── Start Server ─────────────────────────────────────────────────────────────

server.listen(config.port, () => {
  console.log(`[Server] Apni Kirana Store API running on port ${config.port} (${config.nodeEnv})`);

  // Start BullMQ workers
  startWorkers();
});

export default app;
