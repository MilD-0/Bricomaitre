import { getDb, getPool } from '@bric/db/client';
import { orders } from '@bric/db/schema';
import { ORDER_STATUS } from '@bric/storefront-core/order-domain';
import { inArray } from 'drizzle-orm';
import { afterAll, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';

const upload = vi.hoisted(() => vi.fn());
vi.mock('../lib/export-artifacts', async (original) => ({
  ...(await original<typeof import('../lib/export-artifacts')>()),
  uploadPrivateExportArtifact: upload,
}));
vi.mock('../lib/ecotrack', async (original) => ({
  ...(await original<typeof import('../lib/ecotrack')>()),
  readEcotrackCatalog: async () => ({ wilayas: [], communes: [] }),
}));

import { runOrderExportJob } from '../lib/background-jobs';

afterAll(async () => {
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
  try {
    for (const mode of ['selected', 'confirmed'] as const) {
      await runOrderExportJob({ mode, orderIds: selection, __jobMeta: metadata }, helpers);
      const artifact = upload.mock.lastCall![0];
      const workbook = XLSX.read(artifact.body, { type: 'buffer' });
      const data = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets.Sheet1!, { header: 1 });
      expect(data.slice(1).map((line) => Number(line[0]))).toEqual(
        mode === 'selected' ? ids : [ids[0], ids[3]],
      );
      expect(helpers.setDownloadUrl).toHaveBeenLastCalledWith(
        '/api/orders/export/download?jobId=export-fixture',
      );
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
