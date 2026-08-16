import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

import { getDb, getPool } from '@bric/db/client';
import { orders } from '@bric/db/schema';
import {
  beginIdempotentRequest,
  buildIdempotencyFingerprint,
  clearIdempotentRequest,
  completeIdempotentRequest,
  readIdempotencyRecord,
} from '@bric/runtime/idempotency';
import { applyRateLimit } from '@bric/runtime/rate-limit';
import { getRedis } from '@bric/runtime/redis';
import { storefrontOrderCreateRequestSchema } from '@bric/storefront-core/contracts';
import { claimStorefrontOrderIdempotency } from '@bric/storefront-core/order-idempotency';
import { createStorefrontOrder } from '@bric/storefront-core/orders';

const runId = randomUUID();

describe('real PostgreSQL and Redis contracts', () => {
  afterAll(async () => {
    await Promise.allSettled([getRedis().quit(), getPool().end()]);
  });

  it('applies migrations to a queryable PostgreSQL schema', async () => {
    const result = await getPool().query<{
      products: string | null;
      migrations: string | null;
    }>(`
      select
        to_regclass('public.products')::text as products,
        to_regclass('drizzle.__drizzle_migrations')::text as migrations
    `);

    expect(result.rows[0]).toEqual({
      products: 'products',
      migrations: 'drizzle.__drizzle_migrations',
    });
  });

  it('preserves idempotency under concurrent Redis claims', async () => {
    const scope = `service-test:${runId}`;
    const key = 'concurrent-request';
    const fingerprint = buildIdempotencyFingerprint({ orderId: 42 });

    const claims = await Promise.all([
      beginIdempotentRequest({ scope, key, fingerprint, ttlSeconds: 60 }),
      beginIdempotentRequest({ scope, key, fingerprint, ttlSeconds: 60 }),
    ]);

    expect(claims.filter((claim) => claim.kind === 'started')).toHaveLength(1);
    expect(claims.filter((claim) => claim.kind === 'existing')).toHaveLength(1);

    await completeIdempotentRequest({
      scope,
      key,
      fingerprint,
      statusCode: 201,
      body: { orderId: 42 },
      ttlSeconds: 60,
    });
    await expect(readIdempotencyRecord(scope, key)).resolves.toMatchObject({
      status: 'completed',
      fingerprint,
      response: { statusCode: 201, body: { orderId: 42 } },
    });

    await clearIdempotentRequest(scope, key);
  });

  it('enforces rate-limit counters in Redis', async () => {
    const options = {
      scope: `service-test:${runId}`,
      key: 'rate-limit',
      limit: 1,
      windowSeconds: 60,
    };

    await expect(applyRateLimit(options)).resolves.toMatchObject({ ok: true, remaining: 0 });
    await expect(applyRateLimit(options)).resolves.toMatchObject({ ok: false, remaining: 0 });
  });

  it('commits an order and its durable idempotency result atomically', async () => {
    const db = getDb();
    const keyHash = `service-order:${runId}`;
    const fingerprint = buildIdempotencyFingerprint({ phoneNumber1: '0550000001' });
    const payload = storefrontOrderCreateRequestSchema.parse({ phoneNumber1: '0550000001' });

    await expect(
      claimStorefrontOrderIdempotency(db, {
        keyHash,
        fingerprint,
        processingTtlSeconds: 60,
      }),
    ).resolves.toEqual({ kind: 'started' });

    const created = await createStorefrontOrder(db, payload, {
      idempotency: { keyHash, fingerprint },
    });

    try {
      expect(created.item).toMatchObject({
        phoneNumber1: '0550000001',
        variant: 'degraded_capture',
      });
      expect(created.item.statusHistory).toHaveLength(1);
      await expect(
        claimStorefrontOrderIdempotency(db, {
          keyHash,
          fingerprint,
          processingTtlSeconds: 60,
        }),
      ).resolves.toMatchObject({ kind: 'completed', orderId: created.item.id });
    } finally {
      await db.delete(orders).where(eq(orders.id, created.item.id));
    }
  });

  it('rolls back order creation when its durable idempotency claim is missing', async () => {
    const db = getDb();
    const phoneNumber1 = '0550000002';
    const payload = storefrontOrderCreateRequestSchema.parse({ phoneNumber1 });

    await expect(
      createStorefrontOrder(db, payload, {
        idempotency: {
          keyHash: `missing-service-order:${runId}`,
          fingerprint: buildIdempotencyFingerprint({ phoneNumber1 }),
        },
      }),
    ).rejects.toThrow('Unable to complete the durable order idempotency record.');

    await expect(
      db.select({ id: orders.id }).from(orders).where(eq(orders.phoneNumber1, phoneNumber1)),
    ).resolves.toEqual([]);
  });
});
