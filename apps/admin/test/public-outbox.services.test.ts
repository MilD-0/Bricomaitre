import { randomUUID } from 'node:crypto';
import { createDb } from '@bric/db/client';
import { eq, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { metaEventOutbox, marketingEventOutbox } from '@bric/db/schema';
import { processMetaOutboxBatch } from '@bric/storefront-core/meta';
import { processMarketingOutboxBatch } from '@bric/storefront-core/marketing';

const namespace = `outbox_${randomUUID().replaceAll('-', '')}`;
const db = createDb({ max: 4, options: `-c search_path=${namespace},public` });
const pool = db.$client;

beforeAll(async () => {
  // Real PostgreSQL, with the migrated outbox definitions isolated from other service fixtures.
  await db.execute(sql.raw(`create schema ${namespace}`));
  await db.execute(
    sql.raw(
      `create table ${namespace}.meta_event_outbox (like public.meta_event_outbox including all)`,
    ),
  );
  await db.execute(
    sql.raw(
      `create table ${namespace}.marketing_event_outbox (like public.marketing_event_outbox including all)`,
    ),
  );
});
afterAll(async () => {
  await db.execute(sql.raw(`drop schema ${namespace} cascade`));
  await pool.end();
});
beforeEach(async () => {
  await db.delete(metaEventOutbox);
  await db.delete(marketingEventOutbox);
  vi.stubEnv('META_PIXEL_ID', 'test-pixel');
  vi.stubEnv('META_CONVERSIONS_API_TOKEN', 'test-token');
  vi.stubEnv('GOOGLE_ANALYTICS_MEASUREMENT_ID', 'test-measurement');
  vi.stubEnv('GOOGLE_ANALYTICS_API_SECRET', 'test-secret');
  vi.stubEnv('TIKTOK_PIXEL_ID', 'test-pixel');
  vi.stubEnv('TIKTOK_EVENTS_API_ACCESS_TOKEN', 'test-token');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

for (const provider of ['meta', 'google', 'tiktok'] as const) {
  describe(`${provider} outbox ownership`, () => {
    const table = provider === 'meta' ? metaEventOutbox : marketingEventOutbox;
    const waiting = provider === 'meta' ? 'pending' : 'queued';
    const accepted = provider === 'meta' ? 'delivered' : 'accepted';
    const drain = (limit: number) =>
      provider === 'meta'
        ? processMetaOutboxBatch(db, limit)
        : processMarketingOutboxBatch(db, limit);
    const success = () => Response.json(provider === 'meta' ? { events_received: 1 } : { code: 0 });
    async function seed(count: number) {
      const values = Array.from({ length: count }, () => ({
        eventName: 'Purchase',
        eventId: randomUUID(),
        source: 'test',
        eventTime: new Date(),
        nextAttemptAt: new Date(Date.now() - 1_000),
        status: waiting,
      }));
      return provider === 'meta'
        ? db
            .insert(metaEventOutbox)
            .values(
              values.map((value) => ({
                ...value,
                eventSourceUrl: 'https://storefront.example/fr',
              })),
            )
            .returning({ id: metaEventOutbox.id })
        : db
            .insert(marketingEventOutbox)
            .values(
              values.map((value) => ({ ...value, destination: provider, payload: { test: true } })),
            )
            .returning({ id: marketingEventOutbox.id });
    }

    it('claims a waiting event only when ready to send it', async () => {
      const rows = await seed(2);
      const started = Promise.withResolvers<void>();
      const pending = Promise.withResolvers<Response>();
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockImplementationOnce(() => {
          started.resolve();
          return pending.promise;
        })
        .mockImplementation(async () => success());
      vi.stubGlobal('fetch', fetchMock);
      const first = drain(2);
      try {
        await Promise.race([
          started.promise,
          first.then(() => {
            throw new Error('Drain ended before claiming the ready fixture event.');
          }),
        ]);
        const queued = await db
          .select({ id: table.id, status: table.status, attempts: table.attemptCount })
          .from(table);
        expect(queued.filter((row) => row.status === 'processing')).toHaveLength(1);
        expect(queued.filter((row) => row.status === waiting)).toEqual([
          { id: rows[1]!.id, status: waiting, attempts: 0 },
        ]);
        expect(await drain(1)).toMatchObject({ claimed: 1 });
      } finally {
        pending.resolve(success());
        await first;
      }
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(
        await db.select({ status: table.status, attempts: table.attemptCount }).from(table),
      ).toEqual([
        { status: accepted, attempts: 1 },
        { status: accepted, attempts: 1 },
      ]);
    });

    it('keeps the newer delivery when a reclaimed sender later fails', async () => {
      const [row] = await seed(1);
      const started = Promise.withResolvers<void>();
      const pending = Promise.withResolvers<Response>();
      vi.stubGlobal(
        'fetch',
        vi
          .fn<typeof fetch>()
          .mockImplementationOnce(() => {
            started.resolve();
            return pending.promise;
          })
          .mockImplementation(async () => success()),
      );
      const stale = drain(1);
      let staleResult;
      try {
        await Promise.race([
          started.promise,
          stale.then(() => {
            throw new Error('Drain ended before claiming the ready fixture event.');
          }),
        ]);
        await db
          .update(table)
          .set({ processingLeaseExpiresAt: new Date(Date.now() - 1) })
          .where(eq(table.id, row!.id));
        expect(await drain(1)).toMatchObject({ claimed: 1 });
      } finally {
        pending.resolve(Response.json({ message: 'late gateway failure' }, { status: 503 }));
        staleResult = await stale;
      }
      expect(staleResult).toMatchObject(
        provider === 'meta'
          ? { claimed: 1, retryable: 0, failed: 0 }
          : { claimed: 1, retrying: 0, rejected: 0 },
      );
      expect(
        await db
          .select({
            status: table.status,
            attempts: table.attemptCount,
            lease: table.processingLeaseExpiresAt,
          })
          .from(table),
      ).toEqual([{ status: accepted, attempts: 2, lease: null }]);
    });
  });
}
