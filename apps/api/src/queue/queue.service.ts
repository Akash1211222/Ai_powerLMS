import { Injectable, type OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import {
  AI_EVALUATION_QUEUE,
  EVALUATE_SUBMISSION_JOB,
  type EvaluateSubmissionJobData,
} from './queue.constants';

/**
 * Producer side of the background-job system (§13, §15, §37). Enqueues work for
 * the worker. The Redis connection + queue are created LAZILY on first enqueue,
 * so merely booting the API (or compiling it in tests) opens no connection.
 * Enqueue is best-effort: a Redis outage is logged, not thrown — a submission
 * must not fail because the queue is down, and the job is idempotent.
 */
@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly redisUrl: string;
  private connection?: IORedis;
  private aiEvaluation?: Queue<EvaluateSubmissionJobData>;

  constructor(config: ConfigService) {
    this.redisUrl = config.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
  }

  private getQueue(): Queue<EvaluateSubmissionJobData> {
    if (!this.aiEvaluation) {
      this.connection = new IORedis(this.redisUrl, { maxRetriesPerRequest: null });
      this.connection.on('error', (e) => this.logger.warn(`Queue Redis error: ${e.message}`));
      this.aiEvaluation = new Queue(AI_EVALUATION_QUEUE, { connection: this.connection });
    }
    return this.aiEvaluation;
  }

  async enqueueEvaluation(submissionId: string): Promise<void> {
    try {
      await this.getQueue().add(
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

  async onModuleDestroy(): Promise<void> {
    await this.aiEvaluation?.close().catch(() => undefined);
    this.connection?.disconnect();
  }
}
