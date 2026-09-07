import { createDb, getDb, getPool } from '@bric/db/client';
import {
  aiRuns,
  aiToolCalls,
  analyticsEconomicsDailyFacts,
  ecotrackOrderStates,
  ecotrackOrderTrackingEvents,
  orderAcquisitionAttribution,
  orderLineItems,
  orders,
  orderStatusHistory,
  processedOrders,
  profitTrackerDays,
} from '@bric/db/schema';
import { ORDER_STATUS } from '@bric/storefront-core/order-domain';
import { eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { getAiStatsData } from '../lib/ai-stats';
import { refreshAnalyticsFacts } from '../lib/analytics-facts';
import { loadMetaPerformance } from '../lib/analytics/acquisition-data';
import { loadFulfillmentView } from '../lib/analytics/acquisition-fulfillment-views';
import { loadAssumptionsView } from '../lib/analytics/assumptions-search-views';
import {
  loadOperationalProducts,
  loadProductMetaAssociations,
} from '../lib/analytics/catalog-commerce-data';
import { loadCatalogView } from '../lib/analytics/catalog-view';
import {
  loadCustomerEconomics,
  loadOperationalCommunes,
  loadOperationalGeography,
} from '../lib/analytics/customer-commerce-data';
import { clipAnalyticsFilters, resolveAnalyticsFilters } from '../lib/analytics/date-range';
import {
  loadEconomicsPair,
  loadMaterializedEconomicsReport,
} from '../lib/analytics/economics-data';
import { loadAttemptDistribution } from '../lib/analytics/fulfillment-cohorts';
import { getProfitTrackerReport } from '../lib/profit-tracker';

vi.mock('@bric/ai-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@bric/ai-core')>()),
  createProductContentGenerator: () => ({
    generate: async ({ fields }: { fields: string[] }) => ({
      changes: Object.fromEntries(fields.map((field) => [field, 'Generated copy'])),
      reasoning: 'Catalog facts',
      usage: {},
      model: 'test-content',
    }),
  }),
}));

afterAll(async () => {
  await getPool().end();
});

describe('durable AI evidence', () => {
  it('returns empty economics for a valid range outside source coverage without weakening public date validation', async () => {
    const db = getDb();
    const requested = resolveAnalyticsFilters({
      view: 'money',
      range: 'custom',
      startDate: '2091-01-01',
      endDate: '2091-01-03',
    });
    const clipped = clipAnalyticsFilters(requested, '2091-02-01', '2091-02-01');
    expect(clipped.startDate! > clipped.endDate).toBe(true);
    const report = await loadEconomicsPair(db, clipped, '2091-02-01');
    expect(report.current.days).toEqual([]);
    expect(report.current.summary).toMatchObject({ postedOrders: 0, grossProfitDzd: 0 });
    expect(report.previous).toBeNull();
    const cutoffs = {
      orders: '2091-02-01',
      ordersFrom: '2091-02-01',
      posted: '2091-02-01',
      postedFrom: '2091-02-01',
      ecotrack: '2091-02-01',
      ecotrackFrom: '2091-02-01',
      paidFrom: '2091-02-01',
      meta: '2091-02-01',
      metaFrom: '2091-02-01',
      storefront: null,
      storefrontFrom: null,
    };
    const assumptions = await loadAssumptionsView(db, requested, cutoffs);
    expect(assumptions.data.days).toEqual([]);
    const fulfillment = await loadFulfillmentView(db, requested, cutoffs);
    expect(fulfillment.data.summary.postedOrders).toBe(0);

    await expect(
      getProfitTrackerReport(
        { range: 'custom', startDate: clipped.startDate!, endDate: clipped.endDate },
        { db },
      ),
    ).rejects.toThrow();
  });

  it('preserves imported settlements when current projected facts are otherwise usable', async () => {
    const db = getDb(),
      day = '2091-06-01',
      tracking = randomUUID();
    const filters = resolveAnalyticsFilters({
      view: 'money',
      range: 'custom',
      startDate: day,
      endDate: day,
    });
    await db.insert(profitTrackerDays).values({ day, fxRateUsed: '280', grossProfitDzd: '1000' });
    await refreshAnalyticsFacts({
      db,
      startDate: day,
      endDate: day,
      now: new Date('2091-06-02T12:00:00Z'),
    });
    try {
      expect(await loadMaterializedEconomicsReport(db, filters)).not.toBeNull();
      await db.insert(processedOrders).values({
        orderId: tracking,
        tracking,
        importBatchId: randomUUID(),
        encaissedAt: new Date(day + 'T12:00:00Z'),
        amountCollected: '500',
        totalFees: '50',
        netRevenue: '450',
        productCost: '100',
        profit: '350',
      });
      const report = await loadEconomicsPair(db, filters);
      expect(report.current.realized.summary).toMatchObject({
        settledOrders: 1,
        realizedProfitDzd: 350,
        amountCollectedDzd: 500,
      });
      expect(report.current.realized.days).toEqual([
        expect.objectContaining({ date: day, settledOrders: 1, realizedProfitDzd: 350 }),
      ]);
      expect(report.current.coverage.settledOrders).toBe(1);
    } finally {
      await db.delete(processedOrders).where(eq(processedOrders.tracking, tracking));
      await db.delete(profitTrackerDays).where(eq(profitTrackerDays.day, day));
      await db
        .delete(analyticsEconomicsDailyFacts)
        .where(eq(analyticsEconomicsDailyFacts.day, day));
    }
  });

  it('honors local carrier corrections and measures delivery durations independently of database timezone', async () => {
    const db = getDb();
    const day = '2091-07-01';
    const adId = randomUUID();
    const [order] = await db
      .insert(orders)
      .values({
        firstName: 'Analytics correction',
        phoneNumber1: '055' + adId.replace(/\D/g, '').slice(0, 7),
        createdAt: new Date(day + 'T09:00:00Z'),
        totalAmount: '500',
        inHouseStatus: ORDER_STATUS.RETURNED,
        state: 16,
        city: 'Audit',
      })
      .returning();
    const filters = resolveAnalyticsFilters({
      view: 'acquisition',
      range: 'custom',
      startDate: day,
      endDate: day,
    });
    try {
      await db.insert(orderStatusHistory).values({
        orderId: order!.id,
        status: ORDER_STATUS.POSTED,
        changedAt: new Date(day + 'T10:00:00Z'),
        changedBy: 'audit',
      });
      await db.insert(orderLineItems).values({
        orderId: order!.id,
        contentId: adId,
        rawValue: adId,
        titleSnapshot: 'Analytics product',
        originalUnitPrice: '500',
        effectiveUnitPrice: '500',
        quantity: 1,
        lineTotal: '500',
        unitPurchasePriceSnapshot: '100',
      });
      await db.insert(ecotrackOrderStates).values({
        orderId: order!.id,
        trackingNumber: adId,
        reference: String(order!.id),
        currentStatus: 'payed',
        currentAmount: '500',
        deliveryTariff: '50',
      });
      await db.insert(ecotrackOrderTrackingEvents).values([
        {
          orderId: order!.id,
          trackingNumber: adId,
          eventDate: day,
          eventTime: '13:00',
          status: 'livred',
          raw: {},
        },
        {
          orderId: order!.id,
          trackingNumber: adId,
          eventDate: day,
          eventTime: '14:00',
          status: 'payed',
          raw: {},
        },
      ]);
      await db.insert(orderAcquisitionAttribution).values({
        orderId: order!.id,
        semanticsVersion: 'test',
        attributionModel: 'test',
        channel: 'meta_paid',
        landingPath: '/fr',
        metaAdId: adId,
        capturedAt: new Date(day + 'T09:00:00Z'),
      });
      const economics = await getProfitTrackerReport(
        { range: 'custom', startDate: day, endDate: day },
        { db },
      );
      const meta = await loadMetaPerformance(db, filters, economics);
      expect(meta.entities.ads.find((row) => row.id === adId)).toMatchObject({
        paidOrders: 0,
        returnedOrders: 1,
        projectedAdjustedProfitDzd: 0,
        automaticPaidProfitDzd: 0,
      });
      expect(await loadAttemptDistribution(db, day, day)).toEqual([
        expect.objectContaining({ outcome: 'returned', orders: 1 }),
      ]);
      const catalog = await loadCatalogView(db, filters, {
        orders: day,
        ordersFrom: day,
        posted: day,
        postedFrom: day,
        ecotrack: day,
        ecotrackFrom: day,
        paidFrom: day,
        meta: day,
        metaFrom: day,
        storefront: null,
        storefrontFrom: null,
      });
      expect(catalog.data.metrics.find((metric) => metric.key === 'paidUnits')).toMatchObject({
        value: 0,
      });
      expect((await loadProductMetaAssociations(db, filters))[0]).toMatchObject({
        productId: adId,
        paidOrders: 0,
      });
      expect((await loadCustomerEconomics(db, filters, 280)).rows[0]).toMatchObject({
        paidOrders: 0,
        paidValueDzd: 0,
        contributionLtvDzd: 0,
      });
      for (const timezone of ['UTC', 'Africa/Algiers']) {
        const zoned = createDb({ max: 1, options: `-c timezone=${timezone}` });
        try {
          const products = await loadOperationalProducts(zoned, filters, 15);
          expect(products.find((row) => row.id === adId)).toMatchObject({
            deliveryMedianHours: 2,
            paymentMedianHours: 3,
          });
          expect((await loadOperationalGeography(zoned, filters))[0]).toMatchObject({
            deliveryMedianHours: 2,
            paidOrders: 0,
            returnedOrders: 1,
          });
          expect((await loadOperationalCommunes(zoned, filters))[0]).toMatchObject({
            paidOrders: 0,
            returnedOrders: 1,
            deliveryMedianHours: 2,
          });
        } finally {
          await zoned.$client.end();
        }
      }
      for (const status of [
        ORDER_STATUS.MANUAL_COMPLETED,
        ORDER_STATUS.CANCELLED,
        ORDER_STATUS.FAILED,
      ]) {
        await db.update(orders).set({ inHouseStatus: status }).where(eq(orders.id, order!.id));
        const correctedMeta = await loadMetaPerformance(db, filters, economics);
        expect(correctedMeta.entities.ads.find((row) => row.id === adId)).toMatchObject({
          paidOrders: 0,
          returnedOrders: 0,
          automaticPaidProfitDzd: 0,
          projectedAdjustedProfitDzd:
            status === ORDER_STATUS.MANUAL_COMPLETED && economics.settings.defaultReturnRate !== 100
              ? 400
              : 0,
        });
        expect(await loadAttemptDistribution(db, day, day)).toEqual([]);
        expect((await loadProductMetaAssociations(db, filters))[0]).toMatchObject({
          paidOrders: 0,
        });
        expect((await loadCustomerEconomics(db, filters, 280)).rows[0]).toMatchObject({
          paidOrders: 0,
          paidValueDzd: 0,
        });
        expect((await loadOperationalCommunes(db, filters))[0]).toMatchObject({
          paidOrders: 0,
          returnedOrders: 0,
        });
      }
    } finally {
      await db.delete(orders).where(eq(orders.id, order!.id));
    }
  });

  it('counts every tool type while limiting the display and respecting the operations business day', async () => {
    const db = getDb();
    const runs = await db
      .insert(aiRuns)
      .values(
        [new Date('2093-01-01T23:30:00Z'), new Date('2093-01-02T23:30:00Z')].map((startedAt) => ({
          surface: 'admin' as const,
          task: 'admin_chat',
          status: 'completed' as const,
          model: 'test-model',
          promptVersion: 'test-version',
          actorId: randomUUID(),
          startedAt,
          completedAt: new Date(startedAt.getTime() + 1000),
        })),
      )
      .returning();
    try {
      await db.insert(aiToolCalls).values(
        Array.from({ length: 33 }, (_, index) => ({
          runId: runs[0]!.id,
          toolName: `tool-${Math.floor(index / 2)}`,
          status: index === 32 ? 'failed' : 'completed',
          startedAt: runs[0]!.startedAt,
          completedAt: runs[0]!.completedAt,
        })),
      );
      const report = await getAiStatsData(
        {
          surface: 'operations',
          range: 'custom',
          startDate: '2093-01-02',
          endDate: '2093-01-02',
          grain: 'day',
        },
        { db, now: new Date('2093-01-02T12:00:00Z') },
      );
      expect(report.data.kind).toBe('operations');
      if (report.data.kind !== 'operations') throw new Error('Expected operations stats');
      expect(report.data.summary).toMatchObject({
        interactiveRuns: 1,
        toolCalls: 33,
        completedToolCalls: 32,
      });
      expect(report.data.metrics.find((metric) => metric.key === 'toolCompletion')).toMatchObject({
        sample: 33,
        value: 96.97,
      });
      expect(report.data.tools).toHaveLength(16);
      expect(report.data.trend.map((row) => row.bucket)).toEqual(['2093-01-02']);
      expect(report.coverage).toEqual({
        fromDate: '2093-01-02',
        throughDate: '2093-01-02',
        records: 1,
      });
    } finally {
      await db.delete(aiRuns).where(
        inArray(
          aiRuns.id,
          runs.map((run) => run.id),
        ),
      );
    }
  });
});
