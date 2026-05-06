import { Worker, Job } from 'bullmq';
import { createRedisConnection } from '../config/redis';
import { matchStoreForOrder } from '../services/matching.service';
import { assignDriverForOrder } from '../services/driver.service';

// Re-export queue instances so callers can import from a single place
export { matchingQueue, driverQueue } from './queues';

// ─── Workers ──────────────────────────────────────────────────────────────────

let storeMatchingWorker: Worker | null = null;
let driverAssignmentWorker: Worker | null = null;

export function startWorkers(): void {
  // Store matching worker
  storeMatchingWorker = new Worker(
    'store-matching',
    async (job: Job) => {
      const { orderId, excludeStoreIds = [] } = job.data as {
        orderId: string;
        excludeStoreIds?: string[];
      };

      console.log(`[Queue] Processing store-matching job for order ${orderId}`);
      await matchStoreForOrder(orderId, excludeStoreIds);
    },
    { connection: createRedisConnection(), concurrency: 5 },
  );

  // Driver assignment worker
  driverAssignmentWorker = new Worker(
    'driver-assignment',
    async (job: Job) => {
      const { orderId, excludeDriverIds = [] } = job.data as {
        orderId: string;
        excludeDriverIds?: string[];
      };

      console.log(`[Queue] Processing driver-assignment job for order ${orderId}`);
      await assignDriverForOrder(orderId, excludeDriverIds);
    },
    { connection: createRedisConnection(), concurrency: 5 },
  );

  console.log('[BullMQ] Workers started: store-matching, driver-assignment');
}

export async function stopWorkers(): Promise<void> {
  await Promise.all([
    storeMatchingWorker?.close(),
    driverAssignmentWorker?.close(),
  ]);
}
