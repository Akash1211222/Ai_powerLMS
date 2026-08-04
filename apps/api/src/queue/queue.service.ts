import { Injectable, type OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import {
  AI_EVALUATION_QUEUE,
  EVALUATE_SUBMISSION_JOB,
  INTELLIGENCE_QUEUE,
  GENERATE_RECOVERY_PLAN_JOB,
  type EvaluateSubmissionJobData,
  type GenerateRecoveryPlanJobData,
} from './queue.constants';

/**
 * Producer side of the background-job system (§13, §15, §37). Enqueues work for
 * the worker. The Redis connection + queues are created LAZILY on first enqueue,
 * so merely booting the API (or compiling it in tests) opens no connection.
 * Enqueue is best-effort: a Redis outage is logged, not thrown — the triggering
 * action must not fail because the queue is down, and every job is idempotent.
 */
@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly redisUrl: string;
  private connection?: IORedis;
  private aiEvaluation?: Queue<EvaluateSubmissionJobData>;
  private intelligence?: Queue<GenerateRecoveryPlanJobData>;

  constructor(config: ConfigService) {
    this.redisUrl = config.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
  }

  private getConnection(): IORedis {
    if (!this.connection) {
      this.connection = new IORedis(this.redisUrl, { maxRetriesPerRequest: null });
      this.connection.on('error', (e) => this.logger.warn(`Queue Redis error: ${e.message}`));
    }
    return this.connection;
  }

  private getEvaluationQueue(): Queue<EvaluateSubmissionJobData> {
    if (!this.aiEvaluation) {
      this.aiEvaluation = new Queue(AI_EVALUATION_QUEUE, { connection: this.getConnection() });
    }
    return this.aiEvaluation;
  }

  private getIntelligenceQueue(): Queue<GenerateRecoveryPlanJobData> {
    if (!this.intelligence) {
      this.intelligence = new Queue(INTELLIGENCE_QUEUE, { connection: this.getConnection() });
    }
    return this.intelligence;
  }

  async enqueueEvaluation(submissionId: string): Promise<void> {
    try {
      await this.getEvaluationQueue().add(
        EVALUATE_SUBMISSION_JOB,
        { submissionId },
        {
          jobId: `eval:${submissionId}`, // dedupe repeated enqueues for a submission
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      );
    } catch (err) {
      this.logger.warn(`Failed to enqueue evaluation for ${submissionId}: ${(err as Error).message}`);
    }
  }

  async enqueueRecoveryPlan(interventionId: string): Promise<void> {
    try {
      await this.getIntelligenceQueue().add(
        GENERATE_RECOVERY_PLAN_JOB,
        { interventionId },
        {
          jobId: `plan:${interventionId}`, // one generation per intervention
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      );
    } catch (err) {
      this.logger.warn(
        `Failed to enqueue recovery plan for ${interventionId}: ${(err as Error).message}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.aiEvaluation?.close().catch(() => undefined);
    await this.intelligence?.close().catch(() => undefined);
    this.connection?.disconnect();
  }
}
