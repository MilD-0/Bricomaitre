import crypto from 'crypto';
import type IORedis from 'ioredis';
import { type StartJobOptions } from './contract';
import { RELEASE_OWNED_KEY_SCRIPT } from './scripts';

export function requestFingerprint<T>(options: StartJobOptions<T>) {
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

export function nowIso() {
  return new Date().toISOString();
}

export function getSnapshotKey(queueName: string, jobId: string) {
  return `bric:jobs:${queueName}:${jobId}`;
}

export function getOwnerKey(queueName: string, ownerKey: string) {
  return `bric:jobs:${queueName}:owner:${ownerKey}`;
}

export function getCancellationKey(queueName: string, jobId: string) {
  return `bric:jobs:${queueName}:${jobId}:cancel`;
}

export function getActiveKey(queueName: string, scope: 'owner' | 'global', ownerKey: string) {
  return scope === 'global'
    ? `bric:jobs:${queueName}:active`
    : `bric:jobs:${queueName}:active:${ownerKey}`;
}

export function getQueueIndexKey(queueName: string) {
  return `bric:jobs:${queueName}:index`;
}

export function getQueueOriginIndexKey(queueName: string, origin: string) {
  const originKey = crypto.createHash('sha256').update(origin).digest('hex');
  return `bric:jobs:${queueName}:origin:${originKey}:index`;
}

export async function releaseOwnedKey(redis: IORedis, key: string, expectedValue: string) {
  return Number(await redis.eval(RELEASE_OWNED_KEY_SCRIPT, 1, key, expectedValue)) === 1;
}
