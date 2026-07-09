import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';

/**
 * Worker entrypoint (§43). Phase 0 provides the runtime skeleton only: a Redis
 * connection, one `system` queue, and a graceful-shutdown harness. Real job
 * processors (video pipeline, risk engine, weekly reports, notifications) are
 * added in later phases, each as its own idempotent processor module.
 */
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

const SYSTEM_QUEUE = 'system';

export const systemQueue = new Queue(SYSTEM_QUEUE, { connection });

const worker = new Worker(
  SYSTEM_QUEUE,
  async (job) => {
    // Idempotent no-op heartbeat processor for the foundation.
    if (job.name === 'heartbeat') {
      return { ok: true, at: new Date().toISOString() };
    }
    return { ok: true, skipped: job.name };
  },
  { connection, concurrency: 4 },
);

worker.on('ready', () => console.log(`[worker] ready — listening on "${SYSTEM_QUEUE}"`));
worker.on('failed', (job, err) =>
  console.error(`[worker] job ${job?.id} failed: ${err.message}`),
);

async function shutdown(signal: string): Promise<void> {
  console.log(`[worker] ${signal} received, shutting down gracefully...`);
  await worker.close();
  await systemQueue.close();
  await connection.quit();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

console.log('[worker] started');
