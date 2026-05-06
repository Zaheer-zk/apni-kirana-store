/**
 * Global Jest setup — runs after the framework is set up, in each test file's scope.
 *
 * Responsibilities:
 *   • Ensure the test database exists (creates `apni_kirana_store_test` if missing)
 *   • Apply Prisma migrations to the test database (once per Jest worker)
 *   • Truncate all tables before each test for isolation
 *   • Flush Redis test DB before each test
 *   • Disconnect cleanly when the worker exits
 */
import { execSync } from 'child_process';
import { Client } from 'pg';
import { prisma } from '../src/config/prisma';
import { redis } from '../src/config/redis';

// Tracks whether migrations have been applied for this Jest worker process.
let migrationsApplied = false;

async function ensureTestDatabase(): Promise<void> {
  // Connect to default `postgres` database to be able to CREATE DATABASE.
  // Parse the configured DATABASE_URL to extract host/port/credentials.
  const url = new URL(process.env['DATABASE_URL'] as string);
  const dbName = url.pathname.replace(/^\//, '');

  const adminUrl = new URL(url.toString());
  adminUrl.pathname = '/postgres';

  const client = new Client({ connectionString: adminUrl.toString() });
  try {
    await client.connect();
    const exists = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [dbName],
    );
    if (exists.rowCount === 0) {
      await client.query(`CREATE DATABASE "${dbName}"`);
    }
  } finally {
    await client.end().catch(() => {
      /* ignore */
    });
  }
}

async function applyMigrations(): Promise<void> {
  if (migrationsApplied) return;

  await ensureTestDatabase();

  // Run prisma migrate deploy against the test DB.
  execSync('npx prisma migrate deploy', {
    stdio: 'ignore',
    env: {
      ...process.env,
      DATABASE_URL: process.env['DATABASE_URL'],
    },
  });

  migrationsApplied = true;
}

/**
 * Truncate all data tables. Order does not matter because we use
 * RESTART IDENTITY CASCADE.
 */
async function truncateAll(): Promise<void> {
  // Get all table names from Prisma metadata via raw query.
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%'
  `;

  if (tables.length === 0) return;

  const tableList = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`,
  );
}

beforeAll(async () => {
  await applyMigrations();
  // Establish initial connections.
  await prisma.$connect();
});

beforeEach(async () => {
  await truncateAll();
  // Flush only the configured Redis DB (we use index 1 for tests).
  try {
    await redis.flushdb();
  } catch {
    /* ignore — redis may be unavailable in pure-unit test runs */
  }
});

afterAll(async () => {
  await prisma.$disconnect().catch(() => {
    /* ignore */
  });
  try {
    await redis.quit();
  } catch {
    /* ignore */
  }
});
