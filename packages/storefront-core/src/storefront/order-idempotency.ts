import { and, eq, isNull, lte } from 'drizzle-orm';
import { createHash } from 'node:crypto';

import type { getDb } from '@bric/db/client';
import { storefrontOrderIdempotency } from '@bric/db/schema';

type Database = ReturnType<typeof getDb>;

export type StorefrontOrderIdempotencyClaim =
  | { kind: 'started'; createdAt: Date }
  | { kind: 'conflict' }
  | { kind: 'processing'; retryAfterSeconds: number }
  | { kind: 'completed'; orderId: number; metaResponse: unknown };

export async function claimStorefrontOrderIdempotency(
  db: Database,
  options: {
    keyHash: string;
    fingerprint: string;
    processingTtlSeconds: number;
    now?: Date;
  },
  allowExpiredRecovery = true,
): Promise<StorefrontOrderIdempotencyClaim> {
  const now = options.now ?? new Date();
  const expiresAt = new Date(now.getTime() + options.processingTtlSeconds * 1_000);
  const [inserted] = await db
    .insert(storefrontOrderIdempotency)
    .values({
      keyHash: options.keyHash,
      fingerprint: options.fingerprint,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning({ keyHash: storefrontOrderIdempotency.keyHash });

  if (inserted) {
    return { kind: 'started', createdAt: now };
  }

  const [existing] = await db
    .select()
    .from(storefrontOrderIdempotency)
    .where(eq(storefrontOrderIdempotency.keyHash, options.keyHash))
    .limit(1);

  if (!existing) {
    return allowExpiredRecovery
      ? claimStorefrontOrderIdempotency(db, options, false)
      : { kind: 'processing', retryAfterSeconds: options.processingTtlSeconds };
  }

  if (allowExpiredRecovery && !existing.orderId && existing.expiresAt <= now) {
    const deleted = await db
      .delete(storefrontOrderIdempotency)
      .where(
        and(
          eq(storefrontOrderIdempotency.keyHash, options.keyHash),
          isNull(storefrontOrderIdempotency.orderId),
          lte(storefrontOrderIdempotency.expiresAt, now),
        ),
      )
      .returning({ keyHash: storefrontOrderIdempotency.keyHash });
    if (deleted.length > 0) {
      return claimStorefrontOrderIdempotency(db, options, false);
    }
  }

  if (existing.fingerprint !== options.fingerprint) {
    return { kind: 'conflict' };
  }

  if (existing.orderId) {
    return {
      kind: 'completed',
      orderId: existing.orderId,
      metaResponse: existing.metaResponse,
    };
  }

  return {
    kind: 'processing',
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((existing.expiresAt.getTime() - now.getTime()) / 1_000),
    ),
  };
}

export async function clearStorefrontOrderIdempotency(
  db: Database,
  options: { keyHash: string; fingerprint: string; createdAt: Date },
) {
  await db
    .delete(storefrontOrderIdempotency)
    .where(
      and(
        eq(storefrontOrderIdempotency.keyHash, options.keyHash),
        eq(storefrontOrderIdempotency.fingerprint, options.fingerprint),
        eq(storefrontOrderIdempotency.createdAt, options.createdAt),
        isNull(storefrontOrderIdempotency.orderId),
      ),
    );
}

export class StorefrontOrderClaimLostError extends Error {
  constructor() {
    super('The order request claim is no longer owned by this attempt.');
    this.name = 'StorefrontOrderClaimLostError';
  }
}

export function buildIdempotencyFingerprint(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function buildIdempotencyKeyHash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
