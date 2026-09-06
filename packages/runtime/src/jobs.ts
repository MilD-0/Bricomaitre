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
  requestFingerprint?: string;
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
  if (redis.call('get', KEYS[1]) or '') ~= ARGV[6] then return false end
  local snapshot = cjson.decode(ARGV[1])
  if ARGV[7] == '1' then
    redis.call('set', KEYS[2], '1', 'EX', ARGV[2])
  end
  -- Re-encoding through cjson changes [] to {} and can round large numbers.
  local encoded = ARGV[1]
  if redis.call('exists', KEYS[2]) == 1 then
    encoded = ARGV[5]
  end
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

const CLAIM_SNAPSHOT_SCRIPT = `
  local function activeSnapshot(id)
    if not id then return nil end
    local raw = redis.call('get', ARGV[8] .. id)
    if not raw then return nil end
    local status = cjson.decode(raw).status
    if status == 'queued' or status == 'running' then return raw end
    return nil
  end
  local owned = activeSnapshot(redis.call('get', KEYS[3]))
  if owned then return owned end
  local active = activeSnapshot(redis.call('get', KEYS[6]))
  if active then return active end
  redis.call('set', KEYS[6], cjson.decode(ARGV[1]).id, 'EX', ARGV[2])
  ${WRITE_SNAPSHOT_SCRIPT}
`;

function isTerminal(snapshot: JobSnapshot) {
  return snapshot.status !== 'queued' && snapshot.status !== 'running';
}

function requestFingerprint<T>(options: StartJobOptions<T>) {
  const intent = {
    kind: options.kind,
    jobName: options.jobName ?? options.kind,
    origin: options.origin ?? null,
    conversationId: options.conversationId ?? null,
    data: options.data,
  };
  const serialized = JSON.stringify(intent, (_key, value: unknown) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value).sort(([left], [right]) => left.localeCompare(right)),
        )
      : value,
  );
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

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

function parseSnapshot(value: string | null): JobSnapshot | null {
  if (!value) {
    return null;
  }

  return JSON.parse(value) as JobSnapshot;
}

async function writeSnapshot(
  redis: IORedis,
  snapshot: JobSnapshot,
  previous: string,
  options: { ttlSeconds?: number; claimKey?: string; cancel?: boolean } = {},
) {
  const indexKey = getQueueIndexKey(snapshot.queue);
  const keys = [
    getSnapshotKey(snapshot.queue, snapshot.id),
    getCancellationKey(snapshot.queue, snapshot.id),
    getOwnerKey(snapshot.queue, snapshot.ownerKey),
    indexKey,
    snapshot.origin ? getQueueOriginIndexKey(snapshot.queue, snapshot.origin) : indexKey,
    ...(options.claimKey ? [options.claimKey] : []),
  ];
  const raw = await redis.eval(
    options.claimKey ? CLAIM_SNAPSHOT_SCRIPT : WRITE_SNAPSHOT_SCRIPT,
    keys.length,
    ...keys,
    JSON.stringify(snapshot),
    options.ttlSeconds ?? JOB_TTL_SECONDS,
    Date.parse(snapshot.createdAt),
    snapshot.origin ? '1' : '0',
    JSON.stringify({
      ...snapshot,
      cancelRequested: true,
      status: snapshot.status === 'failed' ? 'cancelled' : snapshot.status,
    }),
    previous,
    options.cancel ? '1' : '0',
    `bric:jobs:${snapshot.queue}:`,
  );
  return typeof raw === 'string' ? parseSnapshot(raw) : null;
}

async function updateSnapshot(
  queueName: string,
  jobId: string,
  change: (snapshot: JobSnapshot) => JobSnapshot,
  options: { cancel?: boolean; ttlSeconds?: number } = {},
) {
  const redis = getRedis();
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const raw = await redis.get(getSnapshotKey(queueName, jobId));
    const current = parseSnapshot(raw);
    if (!current || isTerminal(current)) return current;
    const updated = await writeSnapshot(redis, change(current), raw!, options);
    if (updated) return updated;
  }
  throw new Error(`Concurrent updates prevented saving job "${jobId}".`);
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
  return snapshot ? requestJobCancellationById(queueName, snapshot.id) : null;
}

export async function requestJobCancellationById(queueName: string, jobId: string) {
  return updateSnapshot(
    queueName,
    jobId,
    (snapshot) => ({ ...snapshot, cancelRequested: true, updatedAt: nowIso() }),
    { cancel: true },
  );
}

export async function startOwnedJob<T>(options: StartJobOptions<T>): Promise<StartJobResult> {
  const redis = getRedis();
  const activeScope = options.activeScope ?? 'owner';
  const activeKey = getActiveKey(options.queueName, activeScope, options.ownerKey);
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
    requestFingerprint: requestFingerprint(options),
  };

  const claimed = await writeSnapshot(redis, snapshot, '', {
    ttlSeconds: options.ttlSeconds,
    claimKey: activeKey,
  });
  if (!claimed)
    throw new Error(`Unable to claim active job slot for queue "${options.queueName}".`);
  if (claimed.id !== jobId) {
    return {
      kind:
        claimed.ownerKey === options.ownerKey &&
        claimed.requestFingerprint === snapshot.requestFingerprint
          ? 'existing'
          : 'busy',
      job: claimed,
    };
  }

  try {
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
    await Promise.allSettled([
      releaseOwnedKey(redis, activeKey, jobId),
      markJobFailed(
        options.queueName,
        jobId,
        error instanceof Error ? error.message : 'Unable to enqueue job.',
      ),
    ]);
    throw error;
  }

  return { kind: 'started', job: snapshot };
}

export async function updateJobProgress(
  queueName: string,
  jobId: string,
  progress: { phase: string; current: number; total: number },
) {
  const safeTotal = Math.max(progress.total, 0);
  const safeCurrent = Math.max(0, Math.min(progress.current, safeTotal || progress.current));
  return updateSnapshot(queueName, jobId, (snapshot) => ({
    ...snapshot,
    progress: {
      phase: progress.phase,
      current: safeCurrent,
      total: safeTotal,
      percentage: safeTotal === 0 ? 0 : Math.round((safeCurrent / safeTotal) * 100),
    },
    updatedAt: nowIso(),
  }));
}

export async function markJobRunning(queueName: string, jobId: string) {
  return updateSnapshot(queueName, jobId, (snapshot) => ({
    ...snapshot,
    status: 'running',
    updatedAt: nowIso(),
  }));
}

export async function markJobCompleted(
  queueName: string,
  jobId: string,
  payload?: { downloadUrl?: string | null; resultSummary?: Record<string, unknown> | null },
) {
  return updateSnapshot(queueName, jobId, (snapshot) => ({
    ...snapshot,
    status: 'completed',
    completedAt: nowIso(),
    updatedAt: nowIso(),
    downloadUrl: payload?.downloadUrl ?? snapshot.downloadUrl,
    resultSummary: payload?.resultSummary ?? snapshot.resultSummary,
  }));
}

export async function markJobFailed(queueName: string, jobId: string, errorMessage: string) {
  return updateSnapshot(queueName, jobId, (snapshot) => ({
    ...snapshot,
    status: snapshot.cancelRequested ? 'cancelled' : 'failed',
    completedAt: nowIso(),
    updatedAt: nowIso(),
    errorMessage,
  }));
}

export async function updateJobSummary(
  queueName: string,
  jobId: string,
  resultSummary: Record<string, unknown>,
) {
  return updateSnapshot(queueName, jobId, (snapshot) => ({
    ...snapshot,
    resultSummary,
    updatedAt: nowIso(),
  }));
}

export async function updateJobDownloadUrl(queueName: string, jobId: string, downloadUrl: string) {
  return updateSnapshot(queueName, jobId, (snapshot) => ({
    ...snapshot,
    downloadUrl,
    updatedAt: nowIso(),
  }));
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

export function isFinalJobAttempt(
  job: { attemptsMade: number; opts: { attempts?: number } },
  error?: unknown,
) {
  return (
    error instanceof UnrecoverableError ||
    isJobCancellationError(error) ||
    job.attemptsMade >= (job.opts.attempts ?? 1)
  );
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
