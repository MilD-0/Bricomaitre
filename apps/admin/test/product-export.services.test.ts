import { getDb, getPool } from '@bric/db/client';
import { products } from '@bric/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { createQueueWorker, getJobSnapshot, getQueue } from '@bric/runtime/jobs';
import { closeRedisConnections, getRedis } from '@bric/runtime/redis';

const artifacts = vi.hoisted(() => ({
  export: vi.fn(),
  feed: vi.fn(),
  queue: `catalog-feed-${crypto.randomUUID()}`,
}));
vi.mock('../lib/background-job-contract', async (original) => ({
  ...(await original<typeof import('../lib/background-job-contract')>()),
  ADMIN_PRODUCT_CATALOG_FEED_QUEUE: artifacts.queue,
}));
vi.mock('../lib/export-artifacts', async (original) => ({
  ...(await original<typeof import('../lib/export-artifacts')>()),
  uploadExportArtifact: artifacts.export,
  uploadStableArtifact: artifacts.feed,
}));
import {
  runProductCatalogFeedRefreshJob,
  runProductExportJob,
  startProductCatalogFeedRefreshJob,
} from '../lib/background-jobs-commerce';
import type { ProductCatalogFeedPayload } from '../lib/background-job-contract';

const workers: ReturnType<typeof createQueueWorker<ProductCatalogFeedPayload>>[] = [];

afterAll(async () => {
  await Promise.all(workers.map((worker) => worker.close()));
  await getQueue(artifacts.queue).obliterate({ force: true });
  await getQueue(artifacts.queue).close();
  const redis = getRedis();
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', `*${artifacts.queue}*`, 'COUNT', 100);
    cursor = next;
    if (keys.length) await redis.unlink(...keys);
  } while (cursor !== '0');
  await closeRedisConnections();
  await getPool().end();
});

it('exports original product images to workbook and filtered feed with job traffic bounded by database batches', async () => {
  const db = getDb();
  const marker = randomUUID();
  const created = await db
    .insert(products)
    .values([
      {
        title: 'Live',
        slug: `${marker}-live`,
        price: '80',
        oldPrice: '100',
        active: true,
        inStock: true,
        images: [
          'https://images.example.invalid/original.jpg',
          'https://images.example.invalid/second.jpg',
        ],
      },
      {
        title: 'Hidden',
        slug: `${marker}-hidden`,
        price: '100',
        active: false,
        inStock: true,
        images: [],
      },
      {
        title: 'No stock',
        slug: `${marker}-stock`,
        price: '100',
        active: true,
        inStock: false,
        availabilityStatus: 'out_of_stock',
        images: [],
      },
    ])
    .returning();
  const ids = created.map((row) => row.id);
  vi.stubEnv('PRODUCT_EXPORT_BATCH_SIZE', '250');
  vi.stubEnv('PRODUCT_EXPORT_BATCH_DELAY_MS', '0');
  artifacts.export.mockResolvedValue('https://exports.example.invalid/catalog.xlsx');
  artifacts.feed.mockResolvedValue('https://exports.example.invalid/catalog.csv');
  const helpers = {
    updateProgress: vi.fn().mockResolvedValue(undefined),
    updateSummary: vi.fn().mockResolvedValue(undefined),
    setDownloadUrl: vi.fn().mockResolvedValue(undefined),
    throwIfCancelled: vi.fn().mockResolvedValue(undefined),
  };
  const metadata = {
    id: marker,
    ownerKey: 'export@example.invalid',
    queueName: 'fixture',
    activeScope: 'global' as const,
  };
  try {
    for (const feed of [false, true]) {
      vi.clearAllMocks();
      const result = feed
        ? await runProductCatalogFeedRefreshJob({ trigger: 'test', __jobMeta: metadata }, helpers)
        : await runProductExportJob({ __jobMeta: metadata }, helpers);
      const artifact = (feed ? artifacts.feed : artifacts.export).mock.lastCall![0];
      const workbook = XLSX.read(artifact.body, { type: 'buffer' });
      const rows = XLSX.utils.sheet_to_json<Record<string, string | number>>(
        workbook.Sheets[workbook.SheetNames[0]!]!,
      );
      const own = rows.filter((row) => ids.includes(Number(row.id)));
      expect(own.map((row) => Number(row.id))).toEqual(feed ? [ids[0]] : ids);
      expect(own[0]).toMatchObject({
        image_link: created[0]!.images[0],
        price: '100 DZD',
        sale_price: '80 DZD',
      });
      if (!feed) expect(own[1]!.image_link ?? '').toBe('');
      const sourceCount = helpers.updateProgress.mock.calls[1]![0].total as number;
      expect(helpers.updateProgress.mock.calls.length).toBeLessThanOrEqual(
        Math.ceil(sourceCount / 250) + 3,
      );
      expect(helpers.throwIfCancelled.mock.calls.length).toBeLessThanOrEqual(
        Math.ceil(sourceCount / 250) + 1,
      );
      expect(result).toMatchObject({ totalProducts: rows.length });
    }
    artifacts.export.mockClear();
    helpers.throwIfCancelled.mockRejectedValueOnce(new Error('Cancelled'));
    await expect(runProductExportJob({ __jobMeta: metadata }, helpers)).rejects.toThrow(
      'Cancelled',
    );
    expect(artifacts.export).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllEnvs();
    await db.delete(products).where(inArray(products.id, ids));
  }
});

it('exports edits made during and just after a feed pass, coalesces covered requests and retries failed uploads', async () => {
  const db = getDb();
  const [product] = await db
    .insert(products)
    .values({
      title: 'Feed refresh',
      slug: randomUUID(),
      price: '80',
      images: [],
    })
    .returning();
  vi.stubEnv('PRODUCT_CATALOG_FEED_DEBOUNCE_MS', '200');
  let releaseFirst!: () => void;
  const firstHeld = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  artifacts.feed.mockReset();
  artifacts.feed.mockResolvedValue('https://exports.example.invalid/catalog.csv');
  artifacts.feed.mockImplementationOnce(async () => {
    await firstHeld;
    return 'https://exports.example.invalid/catalog.csv';
  });
  const waitCompleted = async (id: string) =>
    vi.waitFor(
      async () => {
        const snapshot = await getJobSnapshot(artifacts.queue, id);
        expect(snapshot?.status).toBe('completed');
      },
      { timeout: 15_000 },
    );
  const exportedPrice = (body: Buffer) => {
    const workbook = XLSX.read(body, { type: 'buffer' });
    return XLSX.utils
      .sheet_to_json<{ id: number; price: string }>(workbook.Sheets[workbook.SheetNames[0]!]!)
      .find((row) => Number(row.id) === product!.id)?.price;
  };
  try {
    const first = await startProductCatalogFeedRefreshJob('first');
    workers.push(
      createQueueWorker<ProductCatalogFeedPayload>(
        artifacts.queue,
        runProductCatalogFeedRefreshJob,
      ),
      createQueueWorker<ProductCatalogFeedPayload>(
        artifacts.queue,
        runProductCatalogFeedRefreshJob,
      ),
    );
    await vi.waitFor(() => expect(artifacts.feed).toHaveBeenCalledOnce(), { timeout: 10_000 });
    await db.update(products).set({ price: '90' }).where(eq(products.id, product!.id));
    const second = await startProductCatalogFeedRefreshJob('edit-during-export');
    await db.update(products).set({ price: '100' }).where(eq(products.id, product!.id));
    const third = await startProductCatalogFeedRefreshJob('another-edit');
    expect(second.kind).toBe('started');
    expect(third.kind).toBe('started');
    // Both successors become runnable while the first worker still owns the export.
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(await getQueue(artifacts.queue).getActiveCount()).toBe(1);
    expect(artifacts.feed).toHaveBeenCalledOnce();
    releaseFirst();
    await Promise.all([first, second, third].map((result) => waitCompleted(result.job!.id)));
    expect(artifacts.feed).toHaveBeenCalledTimes(2);
    expect(exportedPrice(artifacts.feed.mock.calls[0]![0].body)).toBe('80 DZD');
    expect(exportedPrice(artifacts.feed.mock.calls[1]![0].body)).toBe('100 DZD');
    expect((await getJobSnapshot(artifacts.queue, third.job!.id))?.resultSummary).toMatchObject({
      coalesced: true,
    });

    await db.update(products).set({ price: '110' }).where(eq(products.id, product!.id));
    artifacts.feed.mockRejectedValueOnce(new Error('Object storage unavailable'));
    const afterCompletion = await startProductCatalogFeedRefreshJob('edit-after-completion');
    expect(afterCompletion.kind).toBe('started');
    await waitCompleted(afterCompletion.job!.id);
    expect(artifacts.feed).toHaveBeenCalledTimes(4);
    expect(exportedPrice(artifacts.feed.mock.lastCall![0].body)).toBe('110 DZD');
    expect((await getQueue(artifacts.queue).getJob(afterCompletion.job!.id))?.attemptsMade).toBe(2);
  } finally {
    releaseFirst();
    await Promise.all(workers.map((worker) => worker.close()));
    workers.length = 0;
    vi.unstubAllEnvs();
    await db.delete(products).where(eq(products.id, product!.id));
  }
}, 30_000);
