import { getDb, getPool } from '@bric/db/client';
import { orders } from '@bric/db/schema';
import { ORDER_STATUS } from '@bric/storefront-core/order-domain';
import { inArray } from 'drizzle-orm';
import { afterAll, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { NextRequest } from 'next/server';
import { createQueueWorker, getJobSnapshot, getQueue } from '@bric/runtime/jobs';
import { closeRedisConnections, getRedis } from '@bric/runtime/redis';

const mocks = vi.hoisted(() => ({
  queue: `order-export-${crypto.randomUUID()}`,
  upload: vi.fn(),
  readObject: vi.fn(),
}));
const upload = mocks.upload;
vi.mock('../lib/background-job-contract', async (original) => ({
  ...(await original<typeof import('../lib/background-job-contract')>()),
  ADMIN_ORDER_EXPORT_QUEUE: mocks.queue,
}));
vi.mock('../lib/auth', () => ({
  auth: async () => ({
    user: { id: 'export-operator', isAllowed: true, permissions: ['orders_write'] },
  }),
}));
vi.mock('../lib/s3-upload', async (original) => ({
  ...(await original<typeof import('../lib/s3-upload')>()),
  readPrivateS3Object: mocks.readObject,
}));
vi.mock('../lib/export-artifacts', async (original) => ({
  ...(await original<typeof import('../lib/export-artifacts')>()),
  uploadPrivateExportArtifact: mocks.upload,
}));
vi.mock('../lib/ecotrack', async (original) => ({
  ...(await original<typeof import('../lib/ecotrack')>()),
  readEcotrackCatalog: async () => ({ wilayas: [], communes: [] }),
}));

import { runOrderExportJob, startOrderExportJob } from '../lib/background-jobs';
import type { OrderExportPayload } from '../lib/background-job-contract';
import { GET as downloadExport } from '../app/api/orders/export/download/route';

let worker: ReturnType<typeof createQueueWorker<OrderExportPayload>> | undefined;

afterAll(async () => {
  await worker?.close();
  await getQueue(mocks.queue).obliterate({ force: true });
  await getQueue(mocks.queue).close();
  const redis = getRedis();
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', `*${mocks.queue}*`, 'COUNT', 100);
    cursor = next;
    if (keys.length) await redis.unlink(...keys);
  } while (cursor !== '0');
  await closeRedisConnections();
  await getPool().end();
});

it('exports canonical records in ascending order, filters the confirmed cohort and leaves statuses unchanged', async () => {
  const db = getDb();
  const rows = await db
    .insert(orders)
    .values([
      { phoneNumber1: '0550123456', inHouseStatus: ORDER_STATUS.CONFIRMED, createdAt: new Date() },
      {
        phoneNumber1: '0550123456',
        inHouseStatus: ORDER_STATUS.CONFIRMED,
        createdAt: new Date(Date.now() - 8 * 86400000),
      },
      { phoneNumber1: '0550123456', inHouseStatus: ORDER_STATUS.CANCELLED, createdAt: new Date() },
      { phoneNumber1: '0550123456', inHouseStatus: ORDER_STATUS.CONFIRMED, createdAt: new Date() },
    ])
    .returning();
  const ids = rows.map((row) => row.id);
  const selection = [ids[3]!, ids[1]!, ids[0]!, ids[2]!, ids[0]!];
  const helpers = {
    updateProgress: vi.fn().mockResolvedValue(undefined),
    updateSummary: vi.fn().mockResolvedValue(undefined),
    setDownloadUrl: vi.fn().mockResolvedValue(undefined),
    throwIfCancelled: vi.fn().mockResolvedValue(undefined),
  };
  const metadata = {
    id: 'export-fixture',
    ownerKey: 'export@example.invalid',
    queueName: 'admin-order-export',
    activeScope: 'owner' as const,
  };
  upload.mockResolvedValue({
    key: 'exports/orders/fixture.xlsx',
    expiresAt: new Date('2099-01-01'),
  });
  worker = createQueueWorker<OrderExportPayload>(mocks.queue, runOrderExportJob);
  try {
    for (const mode of ['selected', 'confirmed'] as const) {
      const { job } = await startOrderExportJob('export-operator', { mode, orderIds: selection });
      await vi.waitFor(
        async () => {
          expect((await getJobSnapshot(mocks.queue, job!.id))?.status).toBe('completed');
        },
        { timeout: 10_000 },
      );
      const artifact = upload.mock.lastCall![0];
      const workbook = XLSX.read(artifact.body, { type: 'buffer' });
      const data = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets.Sheet1!, { header: 1 });
      expect(data.slice(1).map((line) => Number(line[0]))).toEqual(
        mode === 'selected' ? ids : [ids[0], ids[3]],
      );
      mocks.readObject.mockResolvedValue({
        ContentType: artifact.contentType,
        Body: {
          transformToWebStream: () =>
            new ReadableStream({
              start(controller) {
                controller.enqueue(artifact.body);
                controller.close();
              },
            }),
        },
      });
      const completed = await getJobSnapshot(mocks.queue, job!.id);
      const response = await downloadExport(
        new NextRequest(`http://localhost${completed!.downloadUrl}`),
      );
      expect(response.status).toBe(200);
      expect(mocks.readObject).toHaveBeenLastCalledWith('exports/orders/fixture.xlsx');
      expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from(artifact.body));
    }
    expect(
      await db.select().from(orders).where(inArray(orders.id, ids)).orderBy(orders.id),
    ).toEqual(rows);

    upload.mockClear();
    helpers.throwIfCancelled.mockRejectedValueOnce(new Error('Cancelled before export'));
    await expect(
      runOrderExportJob({ mode: 'selected', orderIds: ids, __jobMeta: metadata }, helpers),
    ).rejects.toThrow('Cancelled before export');
    expect(upload).not.toHaveBeenCalled();
  } finally {
    await db.delete(orders).where(inArray(orders.id, ids));
  }
});
