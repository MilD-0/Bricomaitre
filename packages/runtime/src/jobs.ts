import * as Sentry from '@sentry/node';
import crypto from 'crypto';

import {
  Job,
  Queue,
  QueueEvents,
  UnrecoverableError,
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
  origin?: string | null;
  conversationId?: number | null;
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
  origin?: string;
  conversationId?: number;
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

type LightweightJobOptions<T> = {
  queueName: string;
  jobName: string;
  dedupeKey: string;
  data: T;
  attempts?: number;
  backoffDelayMs?: number;
};

type LightweightWorkerOptions = {
  concurrency?: number;
};

const JOB_TTL_SECONDS = 60 * 60 * 24;
const BULLMQ_SKIP_VERSION_CHECK = true;
const runtimeJobsGlobal = globalThis as typeof globalThis & {
  __bricQueues?: Map<string, Queue>;
  __bricQueueEvents?: Map<string, QueueEvents>;
};
const RELEASE_OWNED_KEY_SCRIPT = `
  if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('del', KEYS[1])
  end
  return 0
`;
const WRITE_SNAPSHOT_SCRIPT = `
  local snapshot = cjson.decode(ARGV[1])
  if redis.call('exists', KEYS[2]) == 1 then
    snapshot.cancelRequested = true
  end
  local encoded = cjson.encode(snapshot)
  redis.call('set', KEYS[1], encoded, 'EX', ARGV[2])
  local currentOwner = redis.call('get', KEYS[3])
  local currentOwnerScore = currentOwner and redis.call('zscore', KEYS[4], currentOwner)
  if not currentOwner or currentOwner == snapshot.id or not currentOwnerScore or tonumber(ARGV[3]) >= tonumber(currentOwnerScore) then
    redis.call('set', KEYS[3], snapshot.id, 'EX', ARGV[2])
  end
  redis.call('zadd', KEYS[4], ARGV[3], snapshot.id)
  redis.call('expire', KEYS[4], ARGV[2])
  if ARGV[4] == '1' then
    redis.call('zadd', KEYS[5], ARGV[3], snapshot.id)
    redis.call('expire', KEYS[5], ARGV[2])
  end
  return encoded
`;

function nowIso() {
  return new Date().toISOString();
}

function getSnapshotKey(queueName: string, jobId: string) {
  return `bric:jobs:${queueName}:${jobId}`;
}

function getOwnerKey(queueName: string, ownerKey: string) {
  return `bric:jobs:${queueName}:owner:${ownerKey}`;
}

function getCancellationKey(queueName: string, jobId: string) {
  return `bric:jobs:${queueName}:${jobId}:cancel`;
}

function getActiveKey(queueName: string, scope: 'owner' | 'global', ownerKey: string) {
  return scope === 'global'
    ? `bric:jobs:${queueName}:active`
    : `bric:jobs:${queueName}:active:${ownerKey}`;
}

function getQueueIndexKey(queueName: string) {
  return `bric:jobs:${queueName}:index`;
}

function getQueueOriginIndexKey(queueName: string, origin: string) {
  const originKey = crypto.createHash('sha256').update(origin).digest('hex');
  return `bric:jobs:${queueName}:origin:${originKey}:index`;
}

async function releaseOwnedKey(redis: IORedis, key: string, expectedValue: string) {
  return Number(await redis.eval(RELEASE_OWNED_KEY_SCRIPT, 1, key, expectedValue)) === 1;
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
  const indexKey = getQueueIndexKey(snapshot.queue);
  const originIndexKey = snapshot.origin
    ? getQueueOriginIndexKey(snapshot.queue, snapshot.origin)
    : indexKey;
  await redis.eval(
    WRITE_SNAPSHOT_SCRIPT,
    5,
    getSnapshotKey(snapshot.queue, snapshot.id),
    getCancellationKey(snapshot.queue, snapshot.id),
    getOwnerKey(snapshot.queue, snapshot.ownerKey),
    indexKey,
    originIndexKey,
    serializeSnapshot(snapshot),
    ttlSeconds,
    Date.parse(snapshot.createdAt),
    snapshot.origin ? '1' : '0',
  );
}

export async function getJobSnapshot(queueName: string, jobId: string) {
  return parseSnapshot(await getRedis().get(getSnapshotKey(queueName, jobId)));
}

export async function listRecentJobSnapshots(
  queueNames: readonly string[],
  limit = 50,
  filters: { origin?: string } = {},
) {
  const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 100));
  const redis = getRedis();
  const snapshots = (
    await Promise.all(
      queueNames.map(async (queueName) => {
        const indexKey = filters.origin
          ? getQueueOriginIndexKey(queueName, filters.origin)
          : getQueueIndexKey(queueName);
        let jobIds = await redis.zrevrange(indexKey, 0, safeLimit - 1);
        if (jobIds.length === 0 && !filters.origin) {
          const snapshotPrefix = `bric:jobs:${queueName}:`;
          let cursor = '0';
          let scanCount = 0;
          const legacyIds = new Set<string>();
          do {
            const [nextCursor, keys] = await redis.scan(
              cursor,
              'MATCH',
              `${snapshotPrefix}*`,
              'COUNT',
              100,
            );
            scanCount += 1;
            cursor = nextCursor;
            for (const key of keys) {
              const suffix = key.slice(snapshotPrefix.length);
              if (
                suffix &&
                suffix !== 'index' &&
                suffix !== 'active' &&
                !suffix.startsWith('active:') &&
                !suffix.startsWith('owner:') &&
                !suffix.startsWith('origin:') &&
                !suffix.endsWith(':cancel')
              ) {
                legacyIds.add(suffix);
              }
            }
          } while (cursor !== '0' && legacyIds.size < safeLimit && scanCount < 10);
          jobIds = [...legacyIds].slice(0, safeLimit);
        }
        if (jobIds.length === 0) return [];
        const values = await redis.mget(jobIds.map((jobId) => getSnapshotKey(queueName, jobId)));
        return values.flatMap((value) => {
          const snapshot = parseSnapshot(value);
          return snapshot ? [snapshot] : [];
        });
      }),
    )
  ).flat();

  return snapshots
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, safeLimit);
}

export async function getLatestOwnedJob(queueName: string, ownerKey: string) {
  const redis = getRedis();
  const latestId = await redis.get(getOwnerKey(queueName, ownerKey));
  return latestId ? getJobSnapshot(queueName, latestId) : null;
}

export async function requestJobCancellation(queueName: string, ownerKey: string) {
  const snapshot = await getLatestOwnedJob(queueName, ownerKey);
  if (!snapshot || (snapshot.status !== 'queued' && snapshot.status !== 'running')) {
    return null;
  }

  await getRedis().set(getCancellationKey(queueName, snapshot.id), '1', 'EX', JOB_TTL_SECONDS);
  const nextSnapshot: JobSnapshot = {
    ...snapshot,
    cancelRequested: true,
    updatedAt: nowIso(),
  };
  await writeSnapshot(getRedis(), nextSnapshot);
  return nextSnapshot;
}

export async function requestJobCancellationById(queueName: string, jobId: string) {
  const snapshot = await getJobSnapshot(queueName, jobId);
  if (!snapshot || (snapshot.status !== 'queued' && snapshot.status !== 'running')) {
    return null;
  }

  await getRedis().set(getCancellationKey(queueName, jobId), '1', 'EX', JOB_TTL_SECONDS);
  const nextSnapshot: JobSnapshot = {
    ...snapshot,
    cancelRequested: true,
    updatedAt: nowIso(),
  };
  await writeSnapshot(getRedis(), nextSnapshot);
  return nextSnapshot;
}

async function startOwnedJobInternal<T>(
  options: StartJobOptions<T>,
  recoverStaleLock: boolean,
): Promise<StartJobResult> {
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
    if (
      activeSnapshot &&
      (activeSnapshot.status === 'queued' || activeSnapshot.status === 'running')
    ) {
      if (activeSnapshot.ownerKey === options.ownerKey) {
        return { kind: 'existing', job: activeSnapshot };
      }

      return { kind: 'busy', job: activeSnapshot };
    }
  }

  const jobId = crypto.randomUUID();
  const createdAt = nowIso();
  const snapshot: JobSnapshot = {
    id: jobId,
    queue: options.queueName,
    kind: options.kind,
    ownerKey: options.ownerKey,
    origin: options.origin ?? null,
    conversationId: options.conversationId ?? null,
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

  const claimed = await redis.set(
    activeKey,
    jobId,
    'EX',
    options.ttlSeconds ?? JOB_TTL_SECONDS,
    'NX',
  );
  if (!claimed) {
    const currentId = await redis.get(activeKey);
    const currentSnapshot = currentId ? await getJobSnapshot(options.queueName, currentId) : null;
    if (currentSnapshot) {
      return { kind: 'busy', job: currentSnapshot };
    }

    if (recoverStaleLock && currentId && (await releaseOwnedKey(redis, activeKey, currentId))) {
      return startOwnedJobInternal(options, false);
    }

    throw new Error(`Unable to claim active job slot for queue "${options.queueName}".`);
  }

  try {
    await writeSnapshot(redis, snapshot, options.ttlSeconds);
    const queue = getQueue(options.queueName);
    await queue.add(
      options.jobName ?? options.kind,
      {
        ...options.data,
        __jobMeta: {
          id: jobId,
          ownerKey: options.ownerKey,
          queueName: options.queueName,
          activeScope,
          requestId: options.requestId ?? null,
        },
      },
      {
        jobId,
        removeOnComplete: 100,
        removeOnFail: 100,
        attempts: 1,
        ...options.queueOptions,
      },
    );
  } catch (error) {
    const failedAt = nowIso();
    await Promise.allSettled([
      releaseOwnedKey(redis, activeKey, jobId),
      writeSnapshot(
        redis,
        {
          ...snapshot,
          status: 'failed',
          completedAt: failedAt,
          updatedAt: failedAt,
          errorMessage: error instanceof Error ? error.message : 'Unable to enqueue job.',
        },
        options.ttlSeconds,
      ),
    ]);
    throw error;
  }

  return { kind: 'started', job: snapshot };
}

export function startOwnedJob<T>(options: StartJobOptions<T>): Promise<StartJobResult> {
  return startOwnedJobInternal(options, true);
}

export async function updateJobProgress(
  queueName: string,
  jobId: string,
  progress: { phase: string; current: number; total: number },
) {
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

export async function markJobCompleted(
  queueName: string,
  jobId: string,
  payload?: { downloadUrl?: string | null; resultSummary?: Record<string, unknown> | null },
) {
  const redis = getRedis();
  const snapshot = await getJobSnapshot(queueName, jobId);
  if (!snapshot) {
    return null;
  }

  const completedAt = nowIso();
  const nextSnapshot: JobSnapshot = {
    ...snapshot,
    status: 'completed',
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

export async function updateJobSummary(
  queueName: string,
  jobId: string,
  resultSummary: Record<string, unknown>,
) {
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
  const redis = getRedis();
  const [snapshot, cancellationRequested] = await Promise.all([
    getJobSnapshot(queueName, jobId),
    redis.exists(getCancellationKey(queueName, jobId)),
  ]);
  if (snapshot?.cancelRequested || cancellationRequested === 1) {
    throw new UnrecoverableError('Job cancelled.');
  }
}

export function isFinalJobAttempt(job: { attemptsMade: number; opts: { attempts?: number } }) {
  return job.attemptsMade >= (job.opts.attempts ?? 1);
}

export function isJobCancellationError(error: unknown) {
  return error instanceof Error && error.message === 'Job cancelled.';
}

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
    if (!job || !isFinalJobAttempt(job)) {
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
      if (!isJobCancellationError(error)) {
        Sentry.withScope((scope: Sentry.Scope) => {
          scope.setTag('service', 'runtime');
          scope.setTag('runtime_component', 'queue_processor');
          scope.setTag('queue', queueName);
          scope.setTag('job_id', job.id ?? 'unknown');
          scope.setTag('job_name', job.name);
          const jobMeta = (
            job.data as { __jobMeta?: { ownerKey?: string; requestId?: string | null } }
          ).__jobMeta;
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
      }
      throw error;
    }
  };

  const worker = new Worker<T>(queueName, wrappedProcessor, {
    connection,
    concurrency: 1,
    skipVersionCheck: BULLMQ_SKIP_VERSION_CHECK,
  });

  worker.on('failed', async (job, error) => {
    if (!job?.id || !isFinalJobAttempt(job)) {
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
      (job.data as { __jobMeta?: { activeScope?: 'owner' | 'global'; ownerKey?: string } })
        .__jobMeta?.activeScope ?? 'owner',
      (job.data as { __jobMeta?: { ownerKey?: string } }).__jobMeta?.ownerKey ?? snapshot.ownerKey,
    );
    await releaseOwnedKey(getRedis(), activeKey, job.id);
  });

  worker.on('failed', async (job) => {
    if (!job?.id || !isFinalJobAttempt(job)) {
      return;
    }

    const snapshot = await getJobSnapshot(queueName, job.id);
    if (!snapshot) {
      return;
    }

    const activeKey = getActiveKey(
      queueName,
      (job.data as { __jobMeta?: { activeScope?: 'owner' | 'global'; ownerKey?: string } })
        .__jobMeta?.activeScope ?? 'owner',
      (job.data as { __jobMeta?: { ownerKey?: string } }).__jobMeta?.ownerKey ?? snapshot.ownerKey,
    );
    await releaseOwnedKey(getRedis(), activeKey, job.id);
  });

  return worker;
}
