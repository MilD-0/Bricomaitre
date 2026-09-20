import { randomUUID } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { getDb, getPool } from '@bric/db/client';
import { offPipelineSales } from '@bric/db/schema';
import { loadMoneyView } from '../lib/analytics/command-money-views';
import { resolveAnalyticsFilters } from '../lib/analytics/date-range';
import { loadCanonicalCutoffs } from '../lib/analytics/data-boundaries';

afterAll(async () => {
  await getPool().end();
});

it('includes realized sales before and after Meta coverage, bounded by the requested range', async () => {
  const db = getDb();
  const dates = ['2026-08-31', '2026-09-01', '2026-09-03', '2026-09-04'];
  const rows = await db
    .insert(offPipelineSales)
    .values(
      dates.map((recognizedOn) => ({
        recognizedOn,
        reference: randomUUID(),
        description: 'Independent realized contribution',
        amountCollected: '18000',
        fees: '500',
        productCost: '11000',
      })),
    )
    .returning();
  try {
    const filters = resolveAnalyticsFilters({
      view: 'money',
      range: 'custom',
      startDate: '2026-09-01',
      endDate: '2026-09-03',
    });
    const cutoffs = await loadCanonicalCutoffs(db, '2026-09-03');
    const report = await loadMoneyView(
      db,
      filters,
      { ...cutoffs, metaFrom: '2026-09-02', meta: '2026-09-02' },
      new Date('2026-09-03T12:00:00Z'),
    );
    expect(report.data.realized.days.map((day) => day.date)).toEqual(['2026-09-03', '2026-09-01']);
    expect(report.data.realized.summary).toMatchObject({
      offPipelineSales: 2,
      amountCollectedDzd: 36000,
      realizedProfitDzd: 13000,
    });
    expect(report.effectiveRanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'economics',
          startDate: '2026-09-02',
          endDate: '2026-09-02',
        }),
        expect.objectContaining({
          key: 'realized',
          startDate: '2026-09-01',
          endDate: '2026-09-03',
        }),
      ]),
    );
  } finally {
    await db.delete(offPipelineSales).where(
      inArray(
        offPipelineSales.id,
        rows.map((row) => row.id),
      ),
    );
  }
});
