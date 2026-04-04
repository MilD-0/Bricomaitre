import * as Sentry from '@sentry/node';
import crypto from 'crypto';

import {
  Job,
  Queue,
  QueueEvents,
  Worker,
  type JobsOptions,
  type Processor,
} from 'bullmq';
import type IORedis from 'ioredis';

import { getBullRedisConnection, getRedis } from './redis';

export type JobState = 'queued' | 'running' | 'completed' | 'cancelled' | 'failed';

export type JobSnapshot = {
  id: string;
  queue: string;
  kind: string;
  ownerKey: string;
  status: JobState;
  progress: {
    phase: string;
    current: number;
    total: number;
    percentage: number;
  };
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
  downloadUrl: string | null;
  resultSummary: Record<string, unknown> | null;
  cancelRequested: boolean;
};

export type StartJobResult =
  | { kind: 'started'; job: JobSnapshot }
  | { kind: 'existing'; job: JobSnapshot }
  | { kind: 'busy'; job: JobSnapshot };

type StartJobOptions<T> = {
  queueName: string;
  kind: string;
  ownerKey: string;
  data: T;
  requestId?: string;
  activeScope?: 'owner' | 'global';
  jobName?: string;
  ttlSeconds?: number;
  queueOptions?: JobsOptions;
};

type QueueProcessorContext<T> = {
  job: Job<T>;
  updateProgress: (progress: { phase: string; current: number; total: number }) => Promise<void>;
  updateSummary: (summary: Record<string, unknown>) => Promise<void>;
  setDownloadUrl: (url: string) => Promise<void>;
  throwIfCancelled: () => Promise<void>;
};

const JOB_TTL_SECONDS = 60 * 60 * 24;
const BULLMQ_SKIP_VERSION_CHECK = true;

function nowIso() {
  return new Date().toISOString();
}

function getSnapshotKey(queueName: string, jobId: string) {
  return `bric:jobs:${queueName}:${jobId}`;
}

function getOwnerKey(queueName: string, ownerKey: string) {
  return `bric:jobs:${queueName}:owner:${ownerKey}`;
}

function getActiveKey(queueName: string, scope: 'owner' | 'global', ownerKey: string) {
  return scope === 'global'
    ? `bric:jobs:${queueName}:active`
    : `bric:jobs:${queueName}:active:${ownerKey}`;
}

function serializeSnapshot(snapshot: JobSnapshot) {
  return JSON.stringify(snapshot);
}

function parseSnapshot(value: string | null): JobSnapshot | null {
  if (!value) {
    return null;
  }

  return JSON.parse(value) as JobSnapshot;
}

async function writeSnapshot(redis: IORedis, snapshot: JobSnapshot, ttlSeconds = JOB_TTL_SECONDS) {
  await redis.set(getSnapshotKey(snapshot.queue, snapshot.id), serializeSnapshot(snapshot), 'EX', ttlSeconds);
  await redis.set(getOwnerKey(snapshot.queue, snapshot.ownerKey), snapshot.id, 'EX', ttlSeconds);
}

export async function getJobSnapshot(queueName: string, jobId: string) {
  return parseSnapshot(await getRedis().get(getSnapshotKey(queueName, jobId)));
}

export async function getLatestOwnedJob(queueName: string, ownerKey: string) {
  const redis = getRedis();
  const latestId = await redis.get(getOwnerKey(queueName, ownerKey));
  return latestId ? getJobSnapshot(queueName, latestId) : null;
}

export async function requestJobCancellation(queueName: string, ownerKey: string) {
  const snapshot = await getLatestOwnedJob(queueName, ownerKey);
  if (!snapshot || snapshot.status !== 'queued' && snapshot.status !== 'running') {
    return null;
  }

  const nextSnapshot: JobSnapshot = {
    ...snapshot,
    cancelRequested: true,
    updatedAt: nowIso(),
  };
  await writeSnapshot(getRedis(), nextSnapshot);
  return nextSnapshot;
}

export async function startOwnedJob<T>(options: StartJobOptions<T>): Promise<StartJobResult> {
  const redis = getRedis();
  const existingOwned = await getLatestOwnedJob(options.queueName, options.ownerKey);
  if (existingOwned && (existingOwned.status === 'queued' || existingOwned.status === 'running')) {
    return { kind: 'existing', job: existingOwned };
  }

  const activeScope = options.activeScope ?? 'owner';
  const activeKey = getActiveKey(options.queueName, activeScope, options.ownerKey);
  const activeJobId = await redis.get(activeKey);

  if (activeJobId) {
    const activeSnapshot = await getJobSnapshot(options.queueName, activeJobId);
    if (activeSnapshot && (activeSnapshot.status === 'queued' || activeSnapshot.status === 'running')) {
      if (activeSnapshot.ownerKey === options.ownerKey) {
        return { kind: 'existing', job: activeSnapshot };
      }

      return { kind: 'busy', job: activeSnapshot };
    }
  }

  const queue = getQueue(options.queueName);
  const jobId = crypto.randomUUID();
  const createdAt = nowIso();
  const snapshot: JobSnapshot = {
    id: jobId,
    queue: options.queueName,
    kind: options.kind,
    ownerKey: options.ownerKey,
    status: 'queued',
    progress: {
      phase: 'queued',
      current: 0,
      total: 0,
      percentage: 0,
    },
    createdAt,
    updatedAt: createdAt,
    completedAt: null,
    errorMessage: null,
    downloadUrl: null,
    resultSummary: null,
    cancelRequested: false,
  };

  const claimed = await redis.set(activeKey, jobId, 'EX', options.ttlSeconds ?? JOB_TTL_SECONDS, 'NX');
  if (!claimed) {
    const currentId = await redis.get(activeKey);
    const currentSnapshot = currentId ? await getJobSnapshot(options.queueName, currentId) : null;
    if (currentSnapshot) {
      return { kind: 'busy', job: currentSnapshot };
    }
  }

  await writeSnapshot(redis, snapshot, options.ttlSeconds);
  await queue.add(options.jobName ?? options.kind, {
    ...options.data,
    __jobMeta: {
      id: jobId,
      ownerKey: options.ownerKey,
      queueName: options.queueName,
      activeScope,
      requestId: options.requestId ?? null,
    },
  }, {
    jobId,
    removeOnComplete: 100,
    removeOnFail: 100,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    ...options.queueOptions,
  });

  return { kind: 'started', job: snapshot };
}

export async function updateJobProgress(queueName: string, jobId: string, progress: { phase: string; current: number; total: number }) {
  const redis = getRedis();
  const snapshot = await getJobSnapshot(queueName, jobId);
  if (!snapshot) {
    return null;
  }

  const safeTotal = Math.max(progress.total, 0);
  const safeCurrent = Math.max(0, Math.min(progress.current, safeTotal || progress.current));
  const nextSnapshot: JobSnapshot = {
    ...snapshot,
    progress: {
      phase: progress.phase,
      current: safeCurrent,
      total: safeTotal,
      percentage: safeTotal === 0 ? 0 : Math.round((safeCurrent / safeTotal) * 100),
    },
    updatedAt: nowIso(),
  };

  await writeSnapshot(redis, nextSnapshot);
  return nextSnapshot;
}

export async function markJobRunning(queueName: string, jobId: string) {
  const redis = getRedis();
  const snapshot = await getJobSnapshot(queueName, jobId);
  if (!snapshot) {
    return null;
  }

  const nextSnapshot: JobSnapshot = {
    ...snapshot,
    status: 'running',
    updatedAt: nowIso(),
  };
  await writeSnapshot(redis, nextSnapshot);
  return nextSnapshot;
}

export async function markJobCompleted(queueName: string, jobId: string, payload?: { downloadUrl?: string | null; resultSummary?: Record<string, unknown> | null }) {
  const redis = getRedis();
  const snapshot = await getJobSnapshot(queueName, jobId);
  if (!snapshot) {
    return null;
  }

  const completedAt = nowIso();
  const nextSnapshot: JobSnapshot = {
    ...snapshot,
    status: snapshot.cancelRequested ? 'cancelled' : 'completed',
    completedAt,
    updatedAt: completedAt,
    downloadUrl: payload?.downloadUrl ?? snapshot.downloadUrl,
    resultSummary: payload?.resultSummary ?? snapshot.resultSummary,
  };
  await writeSnapshot(redis, nextSnapshot);
  return nextSnapshot;
}

export async function markJobFailed(queueName: string, jobId: string, errorMessage: string) {
  const redis = getRedis();
  const snapshot = await getJobSnapshot(queueName, jobId);
  if (!snapshot) {
    return null;
  }

  const completedAt = nowIso();
  const nextSnapshot: JobSnapshot = {
    ...snapshot,
    status: snapshot.cancelRequested ? 'cancelled' : 'failed',
    completedAt,
    updatedAt: completedAt,
    errorMessage,
  };
  await writeSnapshot(redis, nextSnapshot);
  return nextSnapshot;
}

export async function updateJobSummary(queueName: string, jobId: string, resultSummary: Record<string, unknown>) {
  const redis = getRedis();
  const snapshot = await getJobSnapshot(queueName, jobId);
  if (!snapshot) {
    return null;
  }

  const nextSnapshot: JobSnapshot = {
    ...snapshot,
    resultSummary,
    updatedAt: nowIso(),
  };
  await writeSnapshot(redis, nextSnapshot);
  return nextSnapshot;
}

export async function updateJobDownloadUrl(queueName: string, jobId: string, downloadUrl: string) {
  const redis = getRedis();
  const snapshot = await getJobSnapshot(queueName, jobId);
  if (!snapshot) {
    return null;
  }

  const nextSnapshot: JobSnapshot = {
    ...snapshot,
    downloadUrl,
    updatedAt: nowIso(),
  };
  await writeSnapshot(redis, nextSnapshot);
  return nextSnapshot;
}

export async function throwIfJobCancelled(queueName: string, jobId: string) {
  const snapshot = await getJobSnapshot(queueName, jobId);
  if (snapshot?.cancelRequested) {
    throw new Error('Job cancelled.');
  }
}

export function getQueue(queueName: string) {
  return new Queue(queueName, {
    connection: getBullRedisConnection(`queue:${queueName}`),
    skipVersionCheck: BULLMQ_SKIP_VERSION_CHECK,
  });
}

export function getQueueEvents(queueName: string) {
  return new QueueEvents(queueName, {
    connection: getBullRedisConnection(`events:${queueName}`),
    skipVersionCheck: BULLMQ_SKIP_VERSION_CHECK,
  });
}

export function createQueueWorker<T>(
  queueName: string,
  processor: (payload: T, context: QueueProcessorContext<T>) => Promise<Record<string, unknown> | void>,
) {
  const connection = getBullRedisConnection(`worker:${queueName}`);

  const wrappedProcessor: Processor<T> = async (job) => {
    const queue = queueName;
    await markJobRunning(queue, job.id!);
    try {
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
    } catch (error) {
      Sentry.withScope((scope: Sentry.Scope) => {
        scope.setTag('service', 'runtime');
        scope.setTag('runtime_component', 'queue_processor');
        scope.setTag('queue', queueName);
        scope.setTag('job_id', job.id ?? 'unknown');
        scope.setTag('job_name', job.name);
        const jobMeta = (job.data as { __jobMeta?: { ownerKey?: string; requestId?: string | null } }).__jobMeta;
        if (jobMeta?.requestId) {
          scope.setTag('request_id', jobMeta.requestId);
        }
        scope.setContext('job', {
          id: job.id ?? null,
          name: job.name,
          queue: queueName,
          ownerKey: jobMeta?.ownerKey ?? null,
          requestId: jobMeta?.requestId ?? null,
          attemptsMade: job.attemptsMade,
        });
        Sentry.captureException(error);
      });
      throw error;
    }
  };

  const worker = new Worker<T>(queueName, wrappedProcessor, {
    connection,
    concurrency: 1,
    skipVersionCheck: BULLMQ_SKIP_VERSION_CHECK,
  });

  worker.on('failed', async (job, error) => {
    if (!job?.id) {
      return;
    }

    Sentry.withScope((scope: Sentry.Scope) => {
      scope.setTag('service', 'runtime');
      scope.setTag('runtime_component', 'queue_worker');
      scope.setTag('queue', queueName);
      scope.setTag('job_id', job.id);
      scope.setTag('job_name', job.name);
      const jobMeta = (job.data as { __jobMeta?: { ownerKey?: string; requestId?: string | null } }).__jobMeta;
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

    await markJobFailed(queueName, job.id, error.message);
  });

  worker.on('completed', async (job) => {
    if (!job?.id) {
      return;
    }

    const snapshot = await getJobSnapshot(queueName, job.id);
    if (!snapshot) {
      return;
    }

    const activeKey = getActiveKey(
      queueName,
      (job.data as { __jobMeta?: { activeScope?: 'owner' | 'global'; ownerKey?: string } }).__jobMeta?.activeScope ?? 'owner',
      (job.data as { __jobMeta?: { ownerKey?: string } }).__jobMeta?.ownerKey ?? snapshot.ownerKey,
    );
    await getRedis().del(activeKey);
  });

  worker.on('failed', async (job) => {
    if (!job?.id) {
      return;
    }

    const snapshot = await getJobSnapshot(queueName, job.id);
    if (!snapshot) {
      return;
    }

    const activeKey = getActiveKey(
      queueName,
      (job.data as { __jobMeta?: { activeScope?: 'owner' | 'global'; ownerKey?: string } }).__jobMeta?.activeScope ?? 'owner',
      (job.data as { __jobMeta?: { ownerKey?: string } }).__jobMeta?.ownerKey ?? snapshot.ownerKey,
    );
    await getRedis().del(activeKey);
  });

  return worker;
}
