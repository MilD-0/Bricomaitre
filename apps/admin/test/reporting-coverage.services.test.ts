import { randomUUID } from 'node:crypto';
import { and, eq, gte, lte } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { getDb, getPool } from '@bric/db/client';
import {
  orders,
  orderStatusHistory,
  metaAdsDailyInsights,
  profitTrackerDays,
} from '@bric/db/schema';
import { getAnalyticsData } from '../lib/analytics';
import { getProfitTrackerReport, syncProfitTrackerMetaRows } from '../lib/profit-tracker';
import { loadSourceHealth } from '../lib/analytics/source-health';
import { resolveAnalyticsFilters } from '../lib/analytics';
import { loadCanonicalCutoffs } from '../lib/analytics/data-boundaries';
import { loadCustomerEconomics } from '../lib/analytics/customer-commerce-data';
const db = getDb();
const accountId = `coverage-${randomUUID()}`;
let orderId: number | undefined;
const startDate = '2035-09-01',
  endDate = '2035-09-03';
afterAll(async () => {
  await db.delete(metaAdsDailyInsights).where(eq(metaAdsDailyInsights.accountId, accountId));
  await db
    .delete(profitTrackerDays)
    .where(and(gte(profitTrackerDays.day, startDate), lte(profitTrackerDays.day, '2035-09-06')));
  if (orderId) await db.delete(orders).where(eq(orders.id, orderId));
  await getPool().end();
});
describe('reporting coverage across inactive commerce days', () => {
  it('keeps first-order cohort boundaries and repeat orders with legacy phone fallback', async () => {
    const rollback = new Error('customer cohort fixture rollback');
    await expect(
      db.transaction(async (tx) => {
        const marker = randomUUID();
        await tx.insert(orders).values([
          {
            firstName: 'Earlier',
            phoneNumber1: '0551 00 00 01',
            normalizedPhone: `earlier-${marker}`,
            createdAt: new Date('2040-08-31T22:59:59Z'),
            totalAmount: '100',
          },
          {
            firstName: 'Earlier',
            phoneNumber1: '0551 00 00 01',
            normalizedPhone: `earlier-${marker}`,
            createdAt: new Date('2040-09-02T10:00:00Z'),
            totalAmount: '200',
          },
          {
            firstName: 'Included',
            phoneNumber1: `0552 ${marker.replace(/\D/g, '')}`,
            normalizedPhone: '',
            createdAt: new Date('2040-08-31T23:00:00Z'),
            totalAmount: '300',
          },
          {
            firstName: 'Included',
            phoneNumber1: `0552${marker.replace(/\D/g, '')}`,
            normalizedPhone: '',
            createdAt: new Date('2040-09-03T22:59:59Z'),
            totalAmount: '400',
          },
          {
            firstName: 'After',
            phoneNumber1: '0553 00 00 03',
            normalizedPhone: `after-${marker}`,
            createdAt: new Date('2040-09-03T23:00:00Z'),
            totalAmount: '500',
          },
        ]);
        const result = await loadCustomerEconomics(
          tx,
          resolveAnalyticsFilters({
            view: 'catalog',
            range: 'custom',
            startDate: '2040-09-01',
            endDate: '2040-09-03',
          }),
          150,
          false,
        );
        expect(result.summary).toMatchObject({
          customers: 1,
          repeatCustomers: 1,
          averageOrders: 2,
          averageOrderValue: 350,
        });
        expect(result.rows).toEqual([
          expect.objectContaining({ name: 'Included', orders: 2, totalValue: 700 }),
        ]);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });

  it('includes spend before and after the only posted order in the canonical workspace', async () => {
    const [order] = await db
      .insert(orders)
      .values({
        phoneNumber1: '0550000000',
        inHouseStatus: 11,
        createdAt: new Date('2035-09-02T10:00:00Z'),
      })
      .returning();
    orderId = order!.id;
    await db
      .insert(orderStatusHistory)
      .values({ orderId, status: 11, changedAt: new Date('2035-09-02T12:00:00Z') });
    await db.insert(metaAdsDailyInsights).values(
      [startDate, '2035-09-02', endDate].map((day) => ({
        day,
        accountId,
        accountCurrency: 'EUR',
        accountTimezone: 'Africa/Algiers',
        campaignId: 'c',
        adsetId: 's',
        adId: 'a',
        attributionSetting: '7d_click',
        actionReportTime: 'conversion',
        spend: '10',
        syncedAt: new Date('2035-09-04T10:00:00Z'),
      })),
    );
    const query = { range: 'custom' as const, startDate, endDate };
    const raw = await getProfitTrackerReport(query, { db });
    const workspace = await getAnalyticsData(
      { ...query, view: 'command' },
      { db, now: new Date('2035-09-04T12:00:00Z') },
    );
    expect(raw.summary.rawAdCostDzd).toBe(8400);
    expect(workspace.data.kind).toBe('command');
    if (workspace.data.kind !== 'command') throw new Error('Unexpected workspace');
    expect(workspace.data.economics.summary.rawAdCostDzd).toBe(8400);
    expect(await loadCanonicalCutoffs(db, endDate)).toMatchObject({
      orders: endDate,
      posted: endDate,
      meta: endDate,
    });
  });
  it('recognizes synced zero-spend days and leaves unsynced days unknown', async () => {
    await syncProfitTrackerMetaRows([], db, {
      since: '2035-09-04',
      until: '2035-09-05',
      accountCurrency: 'EUR',
      syncedAt: new Date('2035-09-06T10:00:00Z'),
    });
    await db
      .insert(profitTrackerDays)
      .values({ day: '2035-09-06', fxRateUsed: '280', grossProfitDzd: '100' });
    const query = { range: 'custom' as const, startDate: '2035-09-04', endDate: '2035-09-06' };
    const report = await getProfitTrackerReport(query, { db });
    expect(report.days.find((day) => day.date === '2035-09-04')?.spendEur).toBe(0);
    expect(report.days.find((day) => day.date === '2035-09-05')?.spendEur).toBe(0);
    expect(report.days.find((day) => day.date === '2035-09-06')?.spendEur).toBeNull();
    const health = await loadSourceHealth(db, resolveAnalyticsFilters({ ...query, view: 'money' }));
    expect(health.find((source) => source.key === 'meta')).toMatchObject({
      records: 2,
      throughDate: '2035-09-05',
      coveragePct: (2 / 3) * 100,
    });
  });
});
