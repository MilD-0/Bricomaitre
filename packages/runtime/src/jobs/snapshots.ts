import type IORedis from 'ioredis';
import { getRedis } from '../redis';
import { JOB_TTL_SECONDS, type JobSnapshot } from './contract';
import {
  getCancellationKey,
  getOwnerKey,
  getQueueIndexKey,
  getQueueOriginIndexKey,
  getSnapshotKey,
  nowIso,
} from './keys';
import { CLAIM_SNAPSHOT_SCRIPT, WRITE_SNAPSHOT_SCRIPT } from './scripts';

function isTerminal(snapshot: JobSnapshot) {
  return snapshot.status !== 'queued' && snapshot.status !== 'running';
}

function parseSnapshot(value: string | null): JobSnapshot | null {
  if (!value) {
    return null;
  }

  return JSON.parse(value) as JobSnapshot;
}

export async function writeSnapshot(
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

export async function updateSnapshot(
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
  const snapshot = await updateSnapshot(
    queueName,
    jobId,
    (snapshot) => ({ ...snapshot, cancelRequested: true, updatedAt: nowIso() }),
    { cancel: true },
  );
  return snapshot && (snapshot.status === 'queued' || snapshot.status === 'running')
    ? snapshot
    : null;
}
