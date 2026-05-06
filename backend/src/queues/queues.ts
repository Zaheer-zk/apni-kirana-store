/**
 * Queue instances — imported by services to enqueue jobs.
 * Kept separate from queues/index.ts (which sets up Workers) to avoid
 * circular dependencies: services → queues, queues → services.
 */
import { Queue } from 'bullmq';
import { createRedisConnection } from '../config/redis';

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000 },
  removeOnComplete: 100,
  removeOnFail: 200,
};

export const matchingQueue = new Queue('store-matching', {
  connection: createRedisConnection(),
  defaultJobOptions,
});

export const driverQueue = new Queue('driver-assignment', {
  connection: createRedisConnection(),
  defaultJobOptions,
});
