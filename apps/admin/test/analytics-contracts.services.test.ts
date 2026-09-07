import { randomUUID } from 'node:crypto';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';
import { getDb, getPool } from '@bric/db/client';
import {
  analyticsAcquisitionDailyRollups,
  analyticsAiDailyRollups,
  analyticsDailyRollups,
  analyticsDistinctDailyMembers,
  analyticsEvents,
  analyticsJourneys,
  analyticsSessions,
  orders,
  products,
  metaAdsDailyInsights,
  profitTrackerDays,
  profitTrackerSettings,
  processedOrders,
} from '@bric/db/schema';
import {
  ingestStorefrontAnalyticsEvent,
  storefrontAnalyticsEventSchema,
} from '@bric/storefront-core/analytics';
import {
  deleteExpiredAnalyticsEventsBatch,
  deleteUnusedAnalyticsMembersBatch,
  rollUpNextExpiredAnalyticsDay,
} from '@bric/storefront-core/maintenance';
import { getLiveWebsiteProductMetrics } from '../lib/stats-live-commerce';
import { loadStorefrontOrderConversion } from '../lib/analytics/storefront-commerce-data';
import { resolveAnalyticsFilters } from '../lib/analytics/date-range';
import { getCanonicalOrderProjectionDays, getProfitTrackerReport } from '../lib/profit-tracker';
import { toCanonicalOrderProjectionDay } from '../lib/profit-tracker/projections';
import { loadSourceHealth } from '../lib/analytics/source-health';

const db = getDb();
afterAll(async () => getPool().end());
const day = '2044-09-08';
const priorDay = '2044-09-07';
const instant = new Date(`${day}T00:30:00+01:00`);
const future = new Date('2044-10-20T12:00:00Z');
const filters = (startDate = day, endDate = startDate) =>
  resolveAnalyticsFilters({ view: 'storefront', range: 'custom', startDate, endDate });

it('keeps multi-item checkout attribution and Algeria order/session dates through real ingestion, rollup and deletion', async () => {
  const id = randomUUID();
  const catalog = await db
    .insert(products)
    .values(
      [1, 2].map((n) => ({
        title: `contract-${id}-${n}`,
        slug: `contract-${id}-${n}`,
        price: '100',
        unitsSold: 17,
      })),
    )
    .returning();
  const [order] = await db
    .insert(orders)
    .values({ phoneNumber1: '0550000000', createdAt: instant })
    .returning();
  const events = ['page_view', 'begin_checkout', 'ai_assistant_open'] as const;
  try {
    for (const eventName of events) {
      await ingestStorefrontAnalyticsEvent(
        db,
        storefrontAnalyticsEventSchema.parse({
          eventId: `${id}-${eventName}`,
          journeyId: id,
          sessionId: id,
          eventName,
          metadata:
            eventName === 'begin_checkout'
              ? {
                  items: [
                    { productId: catalog[0]!.id, quantity: 2 },
                    { productId: catalog[1]!.id, quantity: 1 },
                    { productId: catalog[0]!.id, quantity: 3 },
                    { productId: '999999999999999999999999999' },
                    { productId: 'invalid' },
                  ],
                }
              : {},
        }),
      );
    }
    for (const [suffix, productId, items] of [
      ['legacy', catalog[0]!.id, [{ productId: catalog[0]!.id }]],
      ['malformed', catalog[1]!.id, 'not-an-array'],
    ] as const) {
      await ingestStorefrontAnalyticsEvent(
        db,
        storefrontAnalyticsEventSchema.parse({
          eventId: `${id}-${suffix}`,
          journeyId: id,
          sessionId: id,
          eventName: 'begin_checkout',
          productId,
          metadata: { items },
        }),
      );
    }
    await db
      .update(analyticsEvents)
      .set({ occurredAt: instant })
      .where(eq(analyticsEvents.journeyId, id));
    await db
      .update(analyticsSessions)
      .set({ startedAt: instant, lastSeenAt: instant })
      .where(eq(analyticsSessions.id, id));
    expect(
      await db
        .select()
        .from(products)
        .where(
          sql`${products.id} in (${sql.join(
            catalog.map((p) => sql`${p.id}`),
            sql`,`,
          )})`,
        ),
    ).toEqual(catalog);
    const [storedCheckout] = await db
      .select()
      .from(analyticsEvents)
      .where(eq(analyticsEvents.eventId, `${id}-begin_checkout`));
    expect(storedCheckout?.productId).toBeNull();
    expect((storedCheckout?.metadata as { items: unknown[] }).items).toHaveLength(5);
    const before = await getLiveWebsiteProductMetrics(db, {
      range: 'custom',
      startDate: day,
      endDate: day,
    });
    for (const product of catalog)
      expect(before.find((row) => row.id === product.id)?.checkoutCount).toBe(2);
    expect(await loadStorefrontOrderConversion(db, filters())).toMatchObject({
      sessions: 1,
      submittedOrders: 1,
      conversionRatePct: 100,
    });
    expect(await loadStorefrontOrderConversion(db, filters(priorDay))).toMatchObject({
      sessions: 0,
      submittedOrders: 0,
    });
    expect(await rollUpNextExpiredAnalyticsDay(db, { now: future })).toBe(day);
    const [overall] = await db
      .select()
      .from(analyticsDailyRollups)
      .where(
        and(eq(analyticsDailyRollups.day, day), eq(analyticsDailyRollups.dimension, 'overall')),
      );
    expect(overall).toMatchObject({
      dayTimezone: 'Africa/Algiers',
      checkoutStarts: 3,
      sessions: 1,
    });
    await deleteExpiredAnalyticsEventsBatch(db, { now: future });
    const after = await getLiveWebsiteProductMetrics(db, {
      range: 'custom',
      startDate: day,
      endDate: day,
    });
    expect(after).toEqual(before);
    expect(await loadStorefrontOrderConversion(db, filters())).toMatchObject({
      sessions: 1,
      submittedOrders: 1,
      conversionRatePct: 100,
    });
    expect(await loadStorefrontOrderConversion(db, filters(priorDay))).toMatchObject({
      sessions: 0,
      submittedOrders: 0,
    });
    await db
      .insert(analyticsDistinctDailyMembers)
      .values(['journey', 'session'].map((metric) => ({ day, metric, memberId: id })));
    expect(await deleteUnusedAnalyticsMembersBatch(db, { limit: 1 })).toBe(1);
    expect(await deleteUnusedAnalyticsMembersBatch(db, { limit: 100 })).toBe(1);
    expect(
      await db
        .select({ metric: analyticsDistinctDailyMembers.metric })
        .from(analyticsDistinctDailyMembers)
        .where(eq(analyticsDistinctDailyMembers.memberId, id)),
    ).toEqual([{ metric: 'ai_journey' }]);
  } finally {
    await db.delete(analyticsEvents).where(eq(analyticsEvents.journeyId, id));
    await db.delete(analyticsSessions).where(eq(analyticsSessions.id, id));
    await db.delete(analyticsJourneys).where(eq(analyticsJourneys.id, id));
    for (const table of [
      analyticsDailyRollups,
      analyticsAcquisitionDailyRollups,
      analyticsAiDailyRollups,
      analyticsDistinctDailyMembers,
    ])
      await db.delete(table).where(eq(table.day, day));
    await db.delete(orders).where(eq(orders.id, order!.id));
    for (const product of catalog) await db.delete(products).where(eq(products.id, product.id));
  }
});

it('retains legacy UTC totals, excludes their overlapping hour and exposes the historical date basis', async () => {
  const id = randomUUID();
  try {
    await db.insert(analyticsJourneys).values({ id });
    await db
      .insert(analyticsDailyRollups)
      .values({ day: priorDay, dimension: 'overall', pageViews: 1, sessions: 1 });
    await db
      .insert(analyticsAcquisitionDailyRollups)
      .values({ day: priorDay, channel: 'direct', evidence: 'none', sessions: 1 });
    for (const [suffix, at] of [['legacy', instant]] as const) {
      await db.insert(analyticsEvents).values({
        eventId: `${id}-${suffix}`,
        journeyId: id,
        sessionId: `${id}-${suffix}`,
        eventName: 'page_view',
        occurredAt: at,
      });
      await db.insert(analyticsSessions).values({
        id: `${id}-${suffix}`,
        journeyId: id,
        startedAt: at,
        lastSeenAt: at,
        entryPath: '/',
        channel: 'direct',
        evidence: 'none',
      });
    }
    // The old session continues after UTC midnight. It remains one session,
    // even when the first local-day rollup contains its later page view.
    await db.insert(analyticsEvents).values({
      eventId: `${id}-continuation`,
      journeyId: id,
      sessionId: `${id}-legacy`,
      eventName: 'page_view',
      occurredAt: new Date(`${day}T01:30:00+01:00`),
    });
    expect(await loadStorefrontOrderConversion(db, filters(priorDay, day))).toMatchObject({
      sessions: 1,
    });
    expect(await rollUpNextExpiredAnalyticsDay(db, { now: future })).toBe(day);
    const rollups = await db
      .select()
      .from(analyticsDailyRollups)
      .where(
        and(
          gte(analyticsDailyRollups.day, priorDay),
          lte(analyticsDailyRollups.day, day),
          eq(analyticsDailyRollups.dimension, 'overall'),
        ),
      );
    expect(rollups.map((r) => [r.day, r.dayTimezone, r.pageViews]).sort()).toEqual([
      [priorDay, 'UTC', 1],
      [day, 'Africa/Algiers', 1],
    ]);
    expect(await loadStorefrontOrderConversion(db, filters(priorDay, day))).toMatchObject({
      sessions: 1,
    });
    expect(
      (await loadSourceHealth(db, filters())).find((s) => s.key === 'storefront')?.dateBasis,
    ).toBe('includes_legacy_utc');
    await deleteExpiredAnalyticsEventsBatch(db, { now: future });
    expect(await loadStorefrontOrderConversion(db, filters(priorDay, day))).toMatchObject({
      sessions: 1,
    });
  } finally {
    await db.delete(analyticsEvents).where(eq(analyticsEvents.journeyId, id));
    await db.delete(analyticsSessions).where(eq(analyticsSessions.journeyId, id));
    await db.delete(analyticsJourneys).where(eq(analyticsJourneys.id, id));
    for (const table of [
      analyticsDailyRollups,
      analyticsAcquisitionDailyRollups,
      analyticsAiDailyRollups,
      analyticsDistinctDailyMembers,
    ])
      await db.delete(table).where(and(gte(table.day, priorDay), lte(table.day, day)));
  }
});

it('focused posted projections match the full report including a settlement-only day consuming Friday carry', async () => {
  const id = randomUUID(),
    friday = '2040-09-07',
    saturday = '2040-09-08',
    sunday = '2040-09-09';
  const previous = await db.select().from(profitTrackerSettings);
  try {
    await db
      .insert(profitTrackerSettings)
      .values({ id: 1, fxRate: '100', defaultReturnRate: '10', restFrom: friday })
      .onConflictDoUpdate({
        target: profitTrackerSettings.id,
        set: { fxRate: '100', defaultReturnRate: '10', restFrom: friday },
      });
    await db.insert(profitTrackerDays).values([
      {
        day: friday,
        spendEur: '10',
        fxRateUsed: '100',
        metaSyncedAt: new Date('2040-09-10T12:00:00Z'),
      },
      {
        day: sunday,
        spendEur: '1',
        fxRateUsed: '100',
        metaSyncedAt: new Date('2040-09-10T12:00:00Z'),
        grossProfitDzd: '1000',
        confirmedOrders: 1,
      },
    ]);
    await db.insert(metaAdsDailyInsights).values(
      [
        [friday, '10'],
        [sunday, '1'],
      ].map(([date, spend]) => ({
        day: date!,
        spend: spend!,
        accountId: id,
        accountCurrency: 'EUR',
        accountTimezone: 'Africa/Algiers',
        campaignId: id,
        adsetId: id,
        adId: id,
        syncedAt: new Date('2040-09-10T12:00:00Z'),
        attributionSetting: '7d_click',
        actionReportTime: 'conversion',
      })),
    );
    await db.insert(processedOrders).values({
      orderId: id,
      tracking: id,
      importBatchId: id,
      encaissedAt: new Date(`${saturday}T12:00:00Z`),
      profit: '25',
    });
    for (const [startDate, endDate] of [
      [friday, sunday],
      [friday, friday],
      [saturday, saturday],
      [sunday, sunday],
    ]) {
      const report = await getProfitTrackerReport({ range: 'custom', startDate, endDate }, { db });
      const focused = await getCanonicalOrderProjectionDays(
        { basis: 'posted', startDate: startDate!, endDate: endDate! },
        { db },
      );
      const expected = focused.map(({ reportDay }) =>
        toCanonicalOrderProjectionDay({
          basis: 'posted',
          reportDay,
          day: report.days.find((d) => d.date === reportDay),
          defaultReturnRate: report.settings.defaultReturnRate,
        }),
      );
      expect(focused).toEqual(expected);
      if (startDate === sunday) expect(focused[0]?.adSpend).toBe(100);
      if (startDate === saturday) expect(focused[0]?.adSpend).toBe(1000);
    }
  } finally {
    await db
      .delete(profitTrackerDays)
      .where(and(gte(profitTrackerDays.day, friday), lte(profitTrackerDays.day, sunday)));
    await db.delete(metaAdsDailyInsights).where(eq(metaAdsDailyInsights.accountId, id));
    await db.delete(processedOrders).where(eq(processedOrders.importBatchId, id));
    await db.delete(profitTrackerSettings);
    if (previous.length) await db.insert(profitTrackerSettings).values(previous);
  }
});
