import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { prisma } from '@fca/database';
import { runSubmissionEvaluation, getProvider } from '@fca/ai';

/**
 * Worker entrypoint (§13, §15, §43). Consumes background jobs. Processors are
 * idempotent — runSubmissionEvaluation skips already-reviewed submissions, so a
 * retry or duplicate delivery is always safe.
 */
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

const SYSTEM_QUEUE = 'system';
const AI_EVALUATION_QUEUE = 'ai-evaluation';

export const systemQueue = new Queue(SYSTEM_QUEUE, { connection });

const systemWorker = new Worker(
  SYSTEM_QUEUE,
  async (job) => (job.name === 'heartbeat' ? { ok: true } : { ok: true, skipped: job.name }),
  { connection, concurrency: 4 },
);

const aiProvider = getProvider();
const evaluationWorker = new Worker<{ submissionId: string }>(
  AI_EVALUATION_QUEUE,
  async (job) => {
    const { submissionId } = job.data;
    const result = await runSubmissionEvaluation(prisma, submissionId, aiProvider);
    console.log(`[worker] evaluated ${submissionId}:`, JSON.stringify(result));
    return result;
  },
  { connection, concurrency: 2 },
);

for (const [name, w] of [
  ['system', systemWorker],
  ['ai-evaluation', evaluationWorker],
] as const) {
  w.on('ready', () => console.log(`[worker] ready — "${name}"`));
  w.on('failed', (job, err) => console.error(`[worker] ${name} job ${job?.id} failed: ${err.message}`));
}

async function shutdown(signal: string): Promise<void> {
  console.log(`[worker] ${signal} received, shutting down gracefully...`);
  await Promise.allSettled([systemWorker.close(), evaluationWorker.close(), systemQueue.close()]);
  await prisma.$disconnect().catch(() => undefined);
  await connection.quit().catch(() => undefined);
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

console.log('[worker] started');
