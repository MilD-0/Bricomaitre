import { randomUUID } from 'node:crypto';
import { and, eq, gte, lte } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';
import { getDb, getPool } from '@bric/db/client';
import {
  analyticsEconomicsDailyFacts,
  metaAdsDailyInsights,
  profitTrackerDays,
  profitTrackerSettings,
  profitTrackerOperatingCosts,
} from '@bric/db/schema';
import { refreshAnalyticsFacts } from '../lib/analytics-facts';
import { getProfitTrackerReport } from '../lib/profit-tracker';
import {
  loadEconomicsPair,
  loadMaterializedEconomicsReport,
} from '../lib/analytics/economics-data';
import { aggregateEconomicsSeries } from '../lib/analytics/economics-series';
import { resolveAnalyticsFilters } from '../lib/analytics/date-range';

afterAll(async () => getPool().end());

it.each([
  { returnRate: 10, manualReturnRate: null },
  { returnRate: 100, manualReturnRate: null },
  { returnRate: 10, manualReturnRate: '100' },
  { returnRate: 100, manualReturnRate: '10' },
])(
  'preserves calculator facts across Friday carry and partial periods at $returnRate with manual override $manualReturnRate',
  async ({ returnRate, manualReturnRate }) => {
    const db = getDb();
    const previousSettings = await db.select().from(profitTrackerSettings);
    const accountId = randomUUID();
    let costId: number | undefined;
    const friday = '2040-09-07',
      saturday = '2040-09-08';
    try {
      await db
        .insert(profitTrackerSettings)
        .values({ id: 1, fxRate: '100', defaultReturnRate: String(returnRate), restFrom: friday })
        .onConflictDoUpdate({
          target: profitTrackerSettings.id,
          set: { fxRate: '100', defaultReturnRate: String(returnRate), restFrom: friday },
        });
      await db.insert(metaAdsDailyInsights).values(
        [friday, saturday].map((day) => ({
          day,
          accountId,
          accountCurrency: 'EUR',
          accountTimezone: 'Africa/Algiers',
          campaignId: 'parity',
          adsetId: 'parity',
          adId: 'parity',
          attributionSetting: '7d_click',
          actionReportTime: 'conversion',
          spend: '10',
          purchases: '2',
          impressions: 100,
          syncedAt: new Date('2040-09-09T10:00:00Z'),
        })),
      );
      await db.insert(profitTrackerDays).values({
        day: saturday,
        fxRateUsed: '100',
        grossProfitDzd: '5000',
        confirmedOrders: 5,
        returnRatePct: manualReturnRate,
        note: 'manual confirmations',
      });
      const [cost] = await db
        .insert(profitTrackerOperatingCosts)
        .values({
          name: accountId,
          amountDzd: '300',
          period: 'monthly',
          startDate: friday,
          endDate: saturday,
        })
        .returning();
      costId = cost!.id;
      await refreshAnalyticsFacts({
        db,
        startDate: friday,
        endDate: saturday,
        now: new Date('2040-09-10T12:00:00Z'),
      });
      for (const [startDate, endDate] of [
        [friday, saturday],
        [saturday, saturday],
        [friday, friday],
      ] as const) {
        const filters = resolveAnalyticsFilters({
          view: 'money',
          range: 'custom',
          startDate,
          endDate,
        });
        const raw = await getProfitTrackerReport({ range: 'custom', startDate, endDate }, { db });
        const stored = await loadMaterializedEconomicsReport(db, filters);
        expect(stored).not.toBeNull();
        if (endDate === saturday) {
          expect(raw.summary.confirmedOrders).toBe(5);
          expect(raw.days[0]).toMatchObject({
            spendEur: 10,
            rolledInDzd: 1000,
            confirmedOrdersSource: 'manual',
          });
        } else {
          expect(raw.coverage.pendingRollforwardDzd).toBe(1000);
        }
        expect.soft(stored?.summary).toEqual(raw.summary);
        expect.soft(stored?.days).toEqual(raw.days);
        expect.soft(stored?.weeks).toEqual(raw.weeks);
        expect.soft(stored?.coverage).toEqual(raw.coverage);
        expect.soft(stored?.warnings).toEqual(raw.warnings);
        for (const grain of ['day', 'week', 'month'] as const) {
          const series = aggregateEconomicsSeries(raw, grain, saturday);
          expect.soft(aggregateEconomicsSeries(stored!, grain, saturday)).toEqual(series);
          if (returnRate === 100 || (manualReturnRate === '100' && startDate === saturday))
            for (const point of series) {
              expect.soft(point.netProfitDzd).toBe(0);
              expect.soft(point.trueProfitDzd).toBe(0);
              expect.soft(point.profitX).toBe(0);
              expect.soft(point.cumulativeNetProfitDzd).toBe(0);
              expect.soft(point.cumulativeTrueProfitDzd).toBe(0);
            }
        }
      }
      const [storedSaturday] = await db
        .select()
        .from(analyticsEconomicsDailyFacts)
        .where(eq(analyticsEconomicsDailyFacts.day, saturday));
      if (returnRate === 100 || manualReturnRate === '100')
        expect(storedSaturday).toMatchObject({
          adjustedProfitDzd: '0.000000',
          netProfitDzd: '0.000000',
          trueProfitDzd: '0.000000',
        });
      const saturdayFilters = resolveAnalyticsFilters({
        view: 'money',
        range: 'custom',
        startDate: saturday,
        endDate: saturday,
      });
      await db
        .update(analyticsEconomicsDailyFacts)
        .set({ calculatorDay: { version: 99 } })
        .where(eq(analyticsEconomicsDailyFacts.day, saturday));
      expect(await loadMaterializedEconomicsReport(db, saturdayFilters)).toBeNull();
      expect((await loadEconomicsPair(db, saturdayFilters)).current.summary.confirmedOrders).toBe(
        5,
      );
      await refreshAnalyticsFacts({
        db,
        startDate: friday,
        endDate: saturday,
        now: new Date('2040-09-10T12:00:00Z'),
      });
      await db
        .update(metaAdsDailyInsights)
        .set({ updatedAt: new Date('2040-09-11T10:00:00Z') })
        .where(
          and(eq(metaAdsDailyInsights.accountId, accountId), eq(metaAdsDailyInsights.day, friday)),
        );
      expect(await loadMaterializedEconomicsReport(db, saturdayFilters)).toBeNull();
    } finally {
      await db.delete(metaAdsDailyInsights).where(eq(metaAdsDailyInsights.accountId, accountId));
      await db.delete(profitTrackerDays).where(eq(profitTrackerDays.day, saturday));
      await db
        .delete(analyticsEconomicsDailyFacts)
        .where(
          and(
            gte(analyticsEconomicsDailyFacts.day, friday),
            lte(analyticsEconomicsDailyFacts.day, saturday),
          ),
        );
      if (costId)
        await db
          .delete(profitTrackerOperatingCosts)
          .where(eq(profitTrackerOperatingCosts.id, costId));
      await db.delete(profitTrackerSettings);
      if (previousSettings.length) await db.insert(profitTrackerSettings).values(previousSettings);
    }
  },
);
