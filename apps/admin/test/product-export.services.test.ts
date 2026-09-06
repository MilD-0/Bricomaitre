import { getDb, getPool } from '@bric/db/client';
import { products } from '@bric/db/schema';
import { inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';

const artifacts = vi.hoisted(() => ({ export: vi.fn(), feed: vi.fn() }));
vi.mock('../lib/export-artifacts', async (original) => ({
  ...(await original<typeof import('../lib/export-artifacts')>()),
  uploadExportArtifact: artifacts.export,
  uploadStableArtifact: artifacts.feed,
}));
import {
  runProductCatalogFeedRefreshJob,
  runProductExportJob,
} from '../lib/background-jobs-commerce';

afterAll(async () => {
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
      expect(result.totalProducts).toBe(rows.length);
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
