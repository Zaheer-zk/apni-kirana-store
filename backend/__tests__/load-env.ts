/**
 * Loads .env.test before any module (including src/config/env.ts) is imported.
 * Registered as `setupFiles` in jest.config.ts so it runs before module loading.
 */
import path from 'path';
import dotenv from 'dotenv';

process.env['NODE_ENV'] = 'test';
dotenv.config({ path: path.resolve(__dirname, '..', '.env.test') });
