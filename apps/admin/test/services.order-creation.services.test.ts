import { eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { getDb, getPool } from '@bric/db/client';
import { orders, storefrontOrderIdempotency } from '@bric/db/schema';
import { getRedis } from '@bric/runtime/redis';
import { storefrontOrderCreateRequestSchema } from '@bric/storefront-core/contracts';
import { deleteExpiredOrderIdempotencyBatch } from '@bric/storefront-core/maintenance';
import {
  buildIdempotencyFingerprint,
  claimStorefrontOrderIdempotency,
} from '@bric/storefront-core/order-idempotency';
import { createStorefrontOrder } from '@bric/storefront-core/orders';

import { getReportingDb } from '../lib/reporting-db';

vi.mock('../lib/server-cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/server-cache')>()),
  revalidateServerTags: vi.fn(),
}));
vi.mock('../lib/storefront-revalidate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/storefront-revalidate')>()),
  revalidateStorefrontProducts: vi.fn(),
}));

const runId = randomUUID();

describe('real PostgreSQL and Redis contracts', () => {
  afterAll(async () => {
    await Promise.allSettled([getRedis().quit(), getPool().end(), getReportingDb().$client.end()]);
  });

  it('commits an order atomically and preserves its replay after idempotency maintenance', async () => {
    const db = getDb();
    const keyHash = `service-order:${runId}`;
    const fingerprint = buildIdempotencyFingerprint({ phoneNumber1: '0550000001' });
    const payload = storefrontOrderCreateRequestSchema.parse({ phoneNumber1: '0550000001' });

    const claim = await claimStorefrontOrderIdempotency(db, {
      keyHash,
      fingerprint,
      processingTtlSeconds: 60,
    });
    expect(claim.kind).toBe('started');
    if (claim.kind !== 'started') throw new Error('Expected a new claim');

    const created = await createStorefrontOrder(db, payload, {
      idempotency: { keyHash, fingerprint, createdAt: claim.createdAt },
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

      const afterRetention = new Date(Date.now() + 2 * 24 * 60 * 60 * 1_000);
      const abandonedKeyHash = `${keyHash}:abandoned`;
      const activeKeyHash = `${keyHash}:active`;
      await claimStorefrontOrderIdempotency(db, {
        keyHash: abandonedKeyHash,
        fingerprint,
        processingTtlSeconds: 60,
      });
      await claimStorefrontOrderIdempotency(db, {
        keyHash: activeKeyHash,
        fingerprint,
        processingTtlSeconds: 60,
        now: afterRetention,
      });
      try {
        await deleteExpiredOrderIdempotencyBatch(db, { now: afterRetention });
        const retained = await db
          .select({ keyHash: storefrontOrderIdempotency.keyHash })
          .from(storefrontOrderIdempotency)
          .where(
            inArray(storefrontOrderIdempotency.keyHash, [keyHash, abandonedKeyHash, activeKeyHash]),
          );
        expect(retained.map((row) => row.keyHash).sort()).toEqual([keyHash, activeKeyHash].sort());
        await expect(
          claimStorefrontOrderIdempotency(db, {
            keyHash,
            fingerprint,
            processingTtlSeconds: 60,
            now: afterRetention,
          }),
        ).resolves.toMatchObject({ kind: 'completed', orderId: created.item.id });
        await expect(
          claimStorefrontOrderIdempotency(db, {
            keyHash,
            fingerprint: `${fingerprint}:changed`,
            processingTtlSeconds: 60,
            now: afterRetention,
          }),
        ).resolves.toEqual({ kind: 'conflict' });
      } finally {
        await db
          .delete(storefrontOrderIdempotency)
          .where(inArray(storefrontOrderIdempotency.keyHash, [abandonedKeyHash, activeKeyHash]));
      }
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
          createdAt: new Date(),
        },
      }),
    ).rejects.toThrow('The order request claim is no longer owned by this attempt.');

    await expect(
      db.select({ id: orders.id }).from(orders).where(eq(orders.phoneNumber1, phoneNumber1)),
    ).resolves.toEqual([]);
  });
});
