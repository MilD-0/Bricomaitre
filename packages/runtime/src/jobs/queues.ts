import * as Sentry from '@sentry/node';
import { Job, Queue, QueueEvents, Worker, type Processor } from 'bullmq';
import crypto from 'crypto';
import { getBullRedisConnection, getRedis } from '../redis';
import {
  type LightweightJobOptions,
  type LightweightWorkerOptions,
  type QueueProcessorContext,
} from './contract';
import { getActiveKey, releaseOwnedKey } from './keys';
import {
  isFinalJobAttempt,
  isJobCancellationError,
  markJobCompleted,
  markJobFailed,
  markJobRunning,
  throwIfJobCancelled,
  updateJobDownloadUrl,
  updateJobProgress,
  updateJobSummary,
} from './progress';
import { getJobSnapshot } from './snapshots';

const BULLMQ_SKIP_VERSION_CHECK = true;

const runtimeJobsGlobal = globalThis as typeof globalThis & {
  __bricQueues?: Map<string, Queue>;
  __bricQueueEvents?: Map<string, QueueEvents>;
};

export function getQueue(queueName: string) {
  const queues = (runtimeJobsGlobal.__bricQueues ??= new Map());
  const existing = queues.get(queueName);
  if (existing) return existing;

  const queue = new Queue(queueName, {
    connection: getBullRedisConnection(`queue:${queueName}`),
    skipVersionCheck: BULLMQ_SKIP_VERSION_CHECK,
  });
  queues.set(queueName, queue);
  return queue;
}

export function getQueueEvents(queueName: string) {
  const queueEvents = (runtimeJobsGlobal.__bricQueueEvents ??= new Map());
  const existing = queueEvents.get(queueName);
  if (existing) return existing;

  const events = new QueueEvents(queueName, {
    connection: getBullRedisConnection(`events:${queueName}`),
    skipVersionCheck: BULLMQ_SKIP_VERSION_CHECK,
  });
  queueEvents.set(queueName, events);
  return events;
}

export function lightweightJobId(queueName: string, dedupeKey: string) {
  return crypto.createHash('sha256').update(`${queueName}\0${dedupeKey}`).digest('hex');
}

/**
 * Enqueue high-volume, database-idempotent work without creating the durable
 * UI/control snapshots used by administrator-owned jobs.
 */
export async function enqueueLightweightJob<T>(options: LightweightJobOptions<T>) {
  const queue = getQueue(options.queueName);
  const jobId = lightweightJobId(options.queueName, options.dedupeKey);
  const existing = await queue.getJob(jobId);
  if (existing) {
    return { kind: 'existing' as const, jobId };
  }

  await queue.add(options.jobName, options.data, {
    jobId,
    attempts: options.attempts ?? 8,
    backoff: {
      type: 'exponential',
      delay: options.backoffDelayMs ?? 30_000,
    },
    removeOnComplete: true,
    removeOnFail: true,
  });

  return { kind: 'created' as const, jobId };
}

/**
 * Consume high-volume work that does not need progress, cancellation, or
 * administrator-visible history. Payloads are deliberately excluded from
 * telemetry and removed from Redis after their terminal attempt.
 */
export function createLightweightQueueWorker<T>(
  queueName: string,
  processor: (payload: T) => Promise<unknown>,
  options: LightweightWorkerOptions = {},
) {
  const worker = new Worker<T>(queueName, async (job) => processor(job.data), {
    connection: getBullRedisConnection(`worker:${queueName}`),
    concurrency: Math.max(1, Math.trunc(options.concurrency ?? 4)),
    skipVersionCheck: BULLMQ_SKIP_VERSION_CHECK,
  });

  worker.on('failed', (job, error) => {
    if (!job || !isFinalJobAttempt(job, error)) {
      return;
    }

    Sentry.withScope((scope: Sentry.Scope) => {
      scope.setTag('service', 'runtime');
      scope.setTag('runtime_component', 'lightweight_queue_worker');
      scope.setTag('queue', queueName);
      scope.setTag('job_id', job.id ?? 'unknown');
      scope.setTag('job_name', job.name);
      scope.setContext('job', {
        id: job.id ?? null,
        name: job.name,
        queue: queueName,
        attemptsMade: job.attemptsMade,
      });
      Sentry.captureException(error);
    });
  });

  return worker;
}

export function createQueueWorker<T>(
  queueName: string,
  processor: (
    payload: T,
    context: QueueProcessorContext<T>,
  ) => Promise<Record<string, unknown> | void>,
) {
  const connection = getBullRedisConnection(`worker:${queueName}`);

  const wrappedProcessor: Processor<T> = async (job) => {
    const queue = queueName;
    await markJobRunning(queue, job.id!);
    const result = await processor(job.data, {
      job,
      updateProgress: async (progress) => {
        await job.updateProgress(progress);
        await updateJobProgress(queue, job.id!, progress);
      },
      updateSummary: async (summary) => {
        await updateJobSummary(queue, job.id!, summary);
      },
      setDownloadUrl: async (url) => {
        await updateJobDownloadUrl(queue, job.id!, url);
      },
      throwIfCancelled: async () => {
        await throwIfJobCancelled(queue, job.id!);
      },
    });

    await markJobCompleted(queue, job.id!, {
      resultSummary: result ?? null,
    });

    return result;
  };

  const worker = new Worker<T>(queueName, wrappedProcessor, {
    connection,
    concurrency: 1,
    skipVersionCheck: BULLMQ_SKIP_VERSION_CHECK,
  });

  worker.on('failed', async (job, error) => {
    if (!job?.id || !isFinalJobAttempt(job, error)) {
      return;
    }

    if (!isJobCancellationError(error)) {
      Sentry.withScope((scope: Sentry.Scope) => {
        scope.setTag('service', 'runtime');
        scope.setTag('runtime_component', 'queue_worker');
        scope.setTag('queue', queueName);
        scope.setTag('job_id', job.id);
        scope.setTag('job_name', job.name);
        const jobMeta = (
          job.data as { __jobMeta?: { ownerKey?: string; requestId?: string | null } }
        ).__jobMeta;
        if (jobMeta?.requestId) {
          scope.setTag('request_id', jobMeta.requestId);
        }
        scope.setContext('job', {
          id: job.id,
          name: job.name,
          queue: queueName,
          ownerKey: jobMeta?.ownerKey ?? null,
          requestId: jobMeta?.requestId ?? null,
          attemptsMade: job.attemptsMade,
        });
        Sentry.captureException(error);
      });
    }

    try {
      await markJobFailed(queueName, job.id, error.message);
    } finally {
      await releaseJobSlot(job);
    }
  });

  async function releaseJobSlot(job: Job<T>) {
    if (!job.id) return;
    const meta = (
      job.data as { __jobMeta?: { activeScope?: 'owner' | 'global'; ownerKey?: string } }
    ).__jobMeta;
    const ownerKey = meta?.ownerKey ?? (await getJobSnapshot(queueName, job.id))?.ownerKey;
    if (ownerKey) {
      await releaseOwnedKey(
        getRedis(),
        getActiveKey(queueName, meta?.activeScope ?? 'owner', ownerKey),
        job.id,
      );
    }
  }

  worker.on('completed', releaseJobSlot);

  return worker;
}
