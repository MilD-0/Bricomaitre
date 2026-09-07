import crypto from 'crypto';
import { getRedis } from '../redis';
import { type JobSnapshot, type StartJobOptions, type StartJobResult } from './contract';
import { getActiveKey, nowIso, releaseOwnedKey, requestFingerprint } from './keys';
import { markJobFailed } from './progress';
import { getQueue } from './queues';
import { writeSnapshot } from './snapshots';

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
