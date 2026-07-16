import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { prisma } from '@fca/database';
import { runSubmissionEvaluation, getProvider } from '@fca/ai';
import { evaluateStudentRisk, recomputeStudentSkills, computeAndStoreStudentScore } from '@fca/analytics';

/**
 * Worker entrypoint (§13, §15, §18, §43). Consumes background jobs. Processors
 * are idempotent — retries and duplicate deliveries are always safe.
 */
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

const SYSTEM_QUEUE = 'system';
const AI_EVALUATION_QUEUE = 'ai-evaluation';
const INTELLIGENCE_QUEUE = 'intelligence';
const RISK_SWEEP_JOB = 'risk-sweep';

export const systemQueue = new Queue(SYSTEM_QUEUE, { connection });
export const intelligenceQueue = new Queue(INTELLIGENCE_QUEUE, { connection });

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

/**
 * Scheduled risk sweep (§18): refresh skills + scores + risk for every active
 * student. Idempotent — snapshots are only written on meaningful change.
 */
const intelligenceWorker = new Worker(
  INTELLIGENCE_QUEUE,
  async (job) => {
    if (job.name !== RISK_SWEEP_JOB) return { skipped: job.name };
    const students = await prisma.batchStudent.findMany({
      where: { status: 'ACTIVE' },
      select: { userId: true },
      distinct: ['userId'],
    });
    let flagged = 0;
    for (const s of students) {
      try {
        await recomputeStudentSkills(prisma, s.userId);
        await computeAndStoreStudentScore(prisma, s.userId);
        const risk = await evaluateStudentRisk(prisma, s.userId);
        if (risk.level !== 'LOW') flagged++;
      } catch (err) {
        console.error(`[worker] risk sweep failed for ${s.userId}: ${(err as Error).message}`);
      }
    }
    console.log(`[worker] risk sweep: ${students.length} students, ${flagged} flagged`);
    return { evaluated: students.length, flagged };
  },
  { connection, concurrency: 1 },
);

/** Registers the recurring risk sweep (idempotent — same jobId replaces it). */
async function scheduleRecurringJobs(): Promise<void> {
  await intelligenceQueue.add(
    RISK_SWEEP_JOB,
    {},
    {
      repeat: { pattern: '0 2 * * *' }, // nightly at 02:00
      jobId: RISK_SWEEP_JOB,
      removeOnComplete: 50,
      removeOnFail: 100,
    },
  );
  console.log('[worker] scheduled nightly risk sweep (02:00)');
}

for (const [name, w] of [
  ['system', systemWorker],
  ['ai-evaluation', evaluationWorker],
  ['intelligence', intelligenceWorker],
] as const) {
  w.on('ready', () => console.log(`[worker] ready — "${name}"`));
  w.on('failed', (job, err) => console.error(`[worker] ${name} job ${job?.id} failed: ${err.message}`));
}

async function shutdown(signal: string): Promise<void> {
  console.log(`[worker] ${signal} received, shutting down gracefully...`);
  await Promise.allSettled([
    systemWorker.close(),
    evaluationWorker.close(),
    intelligenceWorker.close(),
    systemQueue.close(),
    intelligenceQueue.close(),
  ]);
  await prisma.$disconnect().catch(() => undefined);
  await connection.quit().catch(() => undefined);
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

void scheduleRecurringJobs().catch((e) => console.error('[worker] schedule failed:', e.message));
console.log('[worker] started');
