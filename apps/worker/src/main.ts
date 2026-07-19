import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { prisma } from '@fca/database';
import { runSubmissionEvaluation, runRecoveryPlanGeneration, runWeeklyReport, getProvider } from '@fca/ai';
import {
  evaluateStudentRisk,
  recomputeStudentSkills,
  computeAndStoreStudentScore,
  ensureInterventionForRisk,
} from '@fca/analytics';

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
const GENERATE_RECOVERY_PLAN_JOB = 'generate-recovery-plan';
const WEEKLY_REPORTS_JOB = 'weekly-reports';

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

/** In-app notification row (worker path — no mail service here). */
async function notifyRow(
  userId: string,
  type: 'RECOVERY_TASK' | 'RISK_INTERVENTION' | 'PROGRESS_REPORT',
  title: string,
  body: string,
  deepLink = '/dashboard',
) {
  await prisma.notification
    .create({ data: { userId, type, title, body, deepLink } })
    .catch((e) => console.error(`[worker] notify failed: ${(e as Error).message}`));
}

/** Generates the plan for an intervention + notifies the student. Idempotent. */
async function generatePlanFor(interventionId: string) {
  const result = await runRecoveryPlanGeneration(prisma, interventionId, aiProvider);
  if (!result.skipped) {
    const intervention = await prisma.studentIntervention.findUnique({ where: { id: interventionId } });
    if (intervention) {
      await notifyRow(
        intervention.userId,
        'RECOVERY_TASK',
        'Your recovery plan is ready',
        'A personalized plan with concrete next steps is waiting on your dashboard.',
      );
    }
  }
  return result;
}

/**
 * Weekly report fan-out (§21): one progress report per active student for the
 * past week. Idempotent per (student, week) — reruns skip already-generated
 * reports, so a retry or a second Monday run is safe.
 */
async function runWeeklyReports() {
  const students = await prisma.batchStudent.findMany({
    where: { status: 'ACTIVE' },
    select: { userId: true },
    distinct: ['userId'],
  });
  let generated = 0;
  for (const s of students) {
    try {
      const result = await runWeeklyReport(prisma, s.userId, undefined, aiProvider);
      if (!result.skipped) {
        generated++;
        await notifyRow(
          s.userId,
          'PROGRESS_REPORT',
          'Your weekly progress report is ready',
          'A summary of your week, with goals for the next one, is on your dashboard.',
          '/reports',
        );
      }
    } catch (err) {
      console.error(`[worker] weekly report failed for ${s.userId}: ${(err as Error).message}`);
    }
  }
  console.log(`[worker] weekly reports: ${students.length} students, ${generated} generated`);
  return { students: students.length, generated };
}

/**
 * Intelligence queue (§18, §19): the nightly risk sweep (skills → scores → risk
 * → interventions + plans) and on-demand recovery-plan generation. All
 * idempotent — snapshots only on meaningful change, one plan per intervention.
 */
const intelligenceWorker = new Worker<{ interventionId?: string }>(
  INTELLIGENCE_QUEUE,
  async (job) => {
    if (job.name === GENERATE_RECOVERY_PLAN_JOB && job.data.interventionId) {
      return generatePlanFor(job.data.interventionId);
    }
    if (job.name === WEEKLY_REPORTS_JOB) return runWeeklyReports();
    if (job.name !== RISK_SWEEP_JOB) return { skipped: job.name };

    const students = await prisma.batchStudent.findMany({
      where: { status: 'ACTIVE' },
      select: { userId: true },
      distinct: ['userId'],
    });
    let flagged = 0;
    let interventions = 0;
    for (const s of students) {
      try {
        await recomputeStudentSkills(prisma, s.userId);
        await computeAndStoreStudentScore(prisma, s.userId);
        const risk = await evaluateStudentRisk(prisma, s.userId);
        if (risk.level !== 'LOW') flagged++;
        const created = await ensureInterventionForRisk(prisma, risk);
        if (created.created && created.interventionId) {
          interventions++;
          await notifyRow(
            s.userId,
            'RISK_INTERVENTION',
            'We’re here to help',
            'We noticed you might be falling behind, so we prepared a personalized recovery plan.',
          );
          await generatePlanFor(created.interventionId);
        }
      } catch (err) {
        console.error(`[worker] risk sweep failed for ${s.userId}: ${(err as Error).message}`);
      }
    }
    console.log(
      `[worker] risk sweep: ${students.length} students, ${flagged} flagged, ${interventions} interventions`,
    );
    return { evaluated: students.length, flagged, interventions };
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
  await intelligenceQueue.add(
    WEEKLY_REPORTS_JOB,
    {},
    {
      repeat: { pattern: '0 6 * * 1' }, // Mondays at 06:00
      jobId: WEEKLY_REPORTS_JOB,
      removeOnComplete: 20,
      removeOnFail: 50,
    },
  );
  console.log('[worker] scheduled nightly risk sweep (02:00) + weekly reports (Mon 06:00)');
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
