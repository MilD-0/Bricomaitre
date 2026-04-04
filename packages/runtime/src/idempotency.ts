import crypto from 'crypto';

import { getRedis } from './redis';

type IdempotencyRecord =
  | { status: 'processing'; fingerprint: string; createdAt: string }
  | { status: 'completed'; fingerprint: string; createdAt: string; completedAt: string; response: { statusCode: number; body: unknown } };

export function buildIdempotencyFingerprint(value: unknown) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function getIdempotencyKey(scope: string, key: string) {
  return `bric:idempotency:${scope}:${key}`;
}

export async function readIdempotencyRecord(scope: string, key: string) {
  const raw = await getRedis().get(getIdempotencyKey(scope, key));
  return raw ? JSON.parse(raw) as IdempotencyRecord : null;
}

export async function beginIdempotentRequest(options: {
  scope: string;
  key: string;
  fingerprint: string;
  ttlSeconds?: number;
}) {
  const redis = getRedis();
  const existing = await readIdempotencyRecord(options.scope, options.key);
  if (existing) {
    return { kind: 'existing' as const, record: existing };
  }

  const record: IdempotencyRecord = {
    status: 'processing',
    fingerprint: options.fingerprint,
    createdAt: new Date().toISOString(),
  };
  const applied = await redis.set(
    getIdempotencyKey(options.scope, options.key),
    JSON.stringify(record),
    'EX',
    options.ttlSeconds ?? 60 * 60 * 24,
    'NX',
  );

  if (!applied) {
    const current = await readIdempotencyRecord(options.scope, options.key);
    return { kind: 'existing' as const, record: current };
  }

  return { kind: 'started' as const };
}

export async function completeIdempotentRequest(options: {
  scope: string;
  key: string;
  fingerprint: string;
  statusCode: number;
  body: unknown;
  ttlSeconds?: number;
}) {
  const record: IdempotencyRecord = {
    status: 'completed',
    fingerprint: options.fingerprint,
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    response: {
      statusCode: options.statusCode,
      body: options.body,
    },
  };

  await getRedis().set(
    getIdempotencyKey(options.scope, options.key),
    JSON.stringify(record),
    'EX',
    options.ttlSeconds ?? 60 * 60 * 24,
  );
}

export async function clearIdempotentRequest(scope: string, key: string) {
  await getRedis().del(getIdempotencyKey(scope, key));
}
