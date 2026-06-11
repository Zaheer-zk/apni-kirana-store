import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { Server } from 'socket.io';

import { config } from './config/env';
import { errorHandler } from './middleware/error.middleware';
import { globalLimiter } from './middleware/rate-limit.middleware';
import { setupSocket } from './socket';
import { startWorkers } from './queues';
import { runChatRetention } from './services/chat.service';

// ─── Route Imports ─────────────────────────────────────────────────────────────
import authRouter from './routes/auth.routes';
import storesRouter from './routes/stores.routes';
import itemsRouter from './routes/items.routes';
import catalogRouter from './routes/catalog.routes';
import catalogRequestsRouter, { adminRouter as catalogRequestsAdminRouter } from './routes/catalog-requests.routes';
import ordersRouter from './routes/orders.routes';
import wholesalersRouter from './routes/wholesalers.routes';
import driversRouter from './routes/drivers.routes';
import adminRouter from './routes/admin.routes';
import notificationsRouter from './routes/notifications.routes';
import addressesRouter from './routes/addresses.routes';
import usersRouter from './routes/users.routes';
import favoritesRouter from './routes/favorites.routes';
import promosRouter from './routes/promos.routes';
import chatsRouter from './routes/chats.routes';
import supportRouter from './routes/support.routes';
import systemRouter from './routes/system.routes';
import zonesRouter from './routes/zones.routes';
import { recordError } from './utils/error-log';

// ─── App Setup ────────────────────────────────────────────────────────────────

const app = express();
const server = http.createServer(app);

// ─── Socket.io ────────────────────────────────────────────────────────────────

// The io instance is owned by the socket module — setupSocket() stores it
// there so services/routes can `import { io } from './socket'`.
const io = new Server(server, {
  cors: {
    origin: config.cors.origin,
    methods: ['GET', 'POST'],
  },
});

setupSocket(io);

// ─── Middleware ───────────────────────────────────────────────────────────────

// Trust the single nginx hop in front of us in production (see nginx/conf.d/*).
// Without this, express-rate-limit keys every request by the proxy's IP — so
// the OTP limiter (10/15min) and global limiter (300/15min) become ONE shared
// bucket across all clients: 10 OTP requests would lock out every user, and a
// real attacker can't be isolated. `1` = trust exactly one proxy (nginx), which
// is the safe value — never `true`, which would trust a forged X-Forwarded-For
// from a direct client. Dev/test has no proxy, so it's left off there.
if (config.nodeEnv === 'production') {
  app.set('trust proxy', 1);
}

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

// Global rate limit on the whole API surface (health check stays exempt).
app.use('/api/v1', globalLimiter);

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/stores', storesRouter);
app.use('/api/v1/items', itemsRouter);
// Mount /catalog/requests BEFORE /catalog so the more-specific path wins.
// Express tries mounts in order; without this, a future GET /catalog/:id
// handler could swallow `/catalog/requests`.
app.use('/api/v1/catalog/requests', catalogRequestsRouter);
app.use('/api/v1/admin/catalog-requests', catalogRequestsAdminRouter);
app.use('/api/v1/catalog', catalogRouter);
app.use('/api/v1/orders', ordersRouter);
app.use('/api/v1/wholesalers', wholesalersRouter);
app.use('/api/v1/drivers', driversRouter);
app.use('/api/v1/admin', adminRouter);
app.use('/api/v1/notifications', notificationsRouter);
app.use('/api/v1/addresses', addressesRouter);
app.use('/api/v1/users', usersRouter);
app.use('/api/v1/favorites', favoritesRouter);
app.use('/api/v1/promos', promosRouter);
app.use('/api/v1/chats', chatsRouter);
app.use('/api/v1/support', supportRouter);
app.use('/api/v1/system', systemRouter);
app.use('/api/v1/zones', zonesRouter);

// ─── 404 Handler ──────────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────

app.use(errorHandler);

// ─── Process-level error capture ──────────────────────────────────────────────
// Surface async crashes in the admin "App errors" view and keep the process
// alive — alternative is silent death + restart loops.

process.on('unhandledRejection', (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  console.error('[unhandledRejection]', err);
  recordError({
    source: 'unhandledRejection',
    message: err.message,
    stack: err.stack,
  });
});

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
  recordError({
    source: 'uncaughtException',
    message: err.message,
    stack: err.stack,
  });
});

// ─── Start Server ─────────────────────────────────────────────────────────────

server.listen(config.port, () => {
  console.log(`[Server] Quick Easy Mart API running on port ${config.port} (${config.nodeEnv})`);

  // Start BullMQ workers
  startWorkers();

  // Chat retention sweep — soft-delete chats 30d after order close, hard-
  // delete after 90d. Runs once at startup, then every 6 hours. Idempotent.
  if (config.nodeEnv !== 'test') {
    runChatRetention().catch((err) => console.warn('[Chat retention] failed:', err));
    setInterval(
      () => runChatRetention().catch((err) => console.warn('[Chat retention] failed:', err)),
      6 * 60 * 60 * 1000,
    );
  }
});

export default app;
