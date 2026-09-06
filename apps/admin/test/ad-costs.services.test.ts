import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import * as XLSX from 'xlsx';
import { afterAll, expect, it, vi } from 'vitest';
import { getDb, getPool } from '@bric/db/client';
import { actionLogs, adCosts, adSpendImportBatches } from '@bric/db/schema';
import {
  importAdCostsSpreadsheet,
  listAdCosts,
  upsertAdCostEntry,
  deleteAdCostEntry,
} from '../lib/stats-ad-costs';

afterAll(async () => {
  await getPool().end();
});

function workbook(rows: Record<string, unknown>[]) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), 'Ads');
  return XLSX.write(book, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
}

it('rolls back a failed spreadsheet and its history, then preserves totals and zero-valued reimports', async () => {
  const db = getDb(),
    actor = { email: `${randomUUID()}@example.invalid` };
  const campaign = randomUUID(),
    fileName = `${randomUUID()}.xlsx`;
  const row = {
    'Reporting starts': '2092-03-01',
    'Reporting ends': '2092-03-03',
    Campaign: campaign,
    'Amount spent': 0.01,
    Clicks: 1,
    Conversions: 2,
  };
  try {
    await expect(
      importAdCostsSpreadsheet(workbook([row, { ...row, 'Amount spent': -1 }]), 1, fileName, actor),
    ).rejects.toThrow();
    expect(await db.select().from(adCosts).where(eq(adCosts.campaignName, campaign))).toHaveLength(
      0,
    );
    expect(
      await db
        .select()
        .from(adSpendImportBatches)
        .where(eq(adSpendImportBatches.fileName, fileName)),
    ).toHaveLength(0);
    expect(
      await db.select().from(actionLogs).where(eq(actionLogs.createdBy, actor.email)),
    ).toHaveLength(0);
    const first = await importAdCostsSpreadsheet(workbook([row]), 1, fileName, actor);
    expect(first).toMatchObject({ imported: 3, updated: 0 });
    let costs = await db.select().from(adCosts).where(eq(adCosts.campaignName, campaign));
    expect(costs.reduce((sum, cost) => sum + Math.round(Number(cost.spend) * 100), 0)).toBe(1);
    expect(costs.reduce((sum, cost) => sum + (cost.clicks ?? 0), 0)).toBe(1);
    await importAdCostsSpreadsheet(
      workbook([
        {
          'Reporting starts': row['Reporting starts'],
          'Reporting ends': row['Reporting ends'],
          Campaign: campaign,
          'Amount spent': 0.02,
        },
      ]),
      1,
      fileName,
      actor,
    );
    costs = await db.select().from(adCosts).where(eq(adCosts.campaignName, campaign));
    expect(costs.reduce((sum, cost) => sum + (cost.clicks ?? 0), 0)).toBe(1);
    expect(costs.reduce((sum, cost) => sum + (cost.conversions ?? 0), 0)).toBe(2);
    const second = await importAdCostsSpreadsheet(
      workbook([{ ...row, Clicks: 0, Conversions: 0 }]),
      1,
      fileName,
      actor,
    );
    expect(second).toMatchObject({ imported: 0, updated: 3 });
    costs = await db.select().from(adCosts).where(eq(adCosts.campaignName, campaign));
    expect(costs.every((cost) => cost.clicks === 0 && cost.conversions === 0)).toBe(true);
  } finally {
    await db.delete(adCosts).where(eq(adCosts.campaignName, campaign));
    await db.delete(adSpendImportBatches).where(eq(adSpendImportBatches.fileName, fileName));
    await db.delete(actionLogs).where(eq(actionLogs.createdBy, actor.email));
  }
});

it('coalesces concurrent unnamed campaign upserts and applies actual preset date filters', async () => {
  const db = getDb(),
    platform = randomUUID(),
    actor = { email: `${randomUUID()}@example.invalid` };
  try {
    const results = await Promise.all(
      [1, 2].map((spend) => upsertAdCostEntry({ date: '2092-04-10', platform, spend }, actor)),
    );
    expect(results.map((result) => result.id)).toEqual([results[0]!.id, results[0]!.id]);
    await upsertAdCostEntry({ date: '2092-04-01', platform, spend: 3 }, actor);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2092-04-12T12:00:00Z'));
    const filtered = (await listAdCosts({ range: '7d' })).filter(
      (row) => row.platform === platform,
    );
    expect(filtered.map((row) => row.date)).toEqual(['2092-04-10']);
    vi.useRealTimers();
    await expect(deleteAdCostEntry(results[0]!.id, actor)).resolves.toEqual({ id: results[0]!.id });
    await expect(deleteAdCostEntry(results[0]!.id, actor)).resolves.toBeNull();
  } finally {
    vi.useRealTimers();
    await db.delete(adCosts).where(eq(adCosts.platform, platform));
    await db.delete(actionLogs).where(eq(actionLogs.createdBy, actor.email));
  }
});
