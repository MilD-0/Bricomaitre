import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { loadMetaPerformance } from '../lib/analytics/acquisition-data';
import { analyticsQuerySchema } from '../lib/analytics/contract';
import { resolveAnalyticsFilters } from '../lib/analytics/date-range';
import { getProfitTrackerReport } from '../lib/profit-tracker';
import { getLiveStorefrontAiStats } from '../lib/stats-experience-ai';

import { getDb, getPool } from '@bric/db/client';
import {
  analyticsDailyRollups,
  analyticsJourneys,
  analyticsSessions,
  orderAcquisitionAttribution,
  orderAiInfluence,
  orders,
  products,
} from '@bric/db/schema';
import { getRedis } from '@bric/runtime/redis';
import {
  ingestStorefrontAnalyticsEvent,
  type StorefrontAnalyticsEvent,
} from '@bric/storefront-core/analytics';
import { storefrontOrderCreateRequestSchema } from '@bric/storefront-core/contracts';
import {
  deleteExpiredAnalyticsEventsBatch,
  deleteExpiredAnalyticsSessionsBatch,
  rollUpNextExpiredAnalyticsDay,
} from '@bric/storefront-core/maintenance';
import { createStorefrontOrder, readStorefrontOrderByToken } from '@bric/storefront-core/orders';
import { dayInTimezone } from '../lib/analytics/date-range';

import { getReportingDb } from '../lib/reporting-db';
import { getStorefrontExperienceStats } from '../lib/stats-experience';
import { ADMIN_REPORTING_TIMEZONE } from '../lib/stats-experience-shared';
import { buildWebsiteProductMetricsQuery } from '../lib/stats-live-commerce';

vi.mock('../lib/server-cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/server-cache')>()),
  revalidateServerTags: vi.fn(),
}));
vi.mock('../lib/storefront-revalidate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/storefront-revalidate')>()),
  revalidateStorefrontProducts: vi.fn(),
}));

const runId = randomUUID();

describe('real PostgreSQL and Redis contracts', () => {
  afterAll(async () => {
    await Promise.allSettled([getRedis().quit(), getPool().end(), getReportingDb().$client.end()]);
  });

  it('connects storefront acquisition and AI evidence to durable order outcomes', async () => {
    const db = getDb();
    const journeyId = `service-journey:${runId}`;
    const sessionId = `service-session:${runId}`;
    const visitId = `service-visit:${runId}`;
    const capturedAt = new Date();
    const capturedAtIso = capturedAt.toISOString();
    const campaignId = '120012345678901';
    const adsetId = '120012345678902';
    const adId = '120012345678903';
    const [product] = await db
      .insert(products)
      .values({
        title: `Service analytics product ${runId}`,
        slug: `service-analytics-${runId}`,
        price: '8000.00',
        purchasePrice: '5000.00',
      })
      .returning({ id: products.id });
    let orderId: number | null = null;
    let legacyOrderId: number | null = null;

    const commonEvent: Omit<StorefrontAnalyticsEvent, 'eventId' | 'eventName'> = {
      eventVersion: 1 as const,
      visitId,
      journeyId,
      sessionId,
      occurredAt: capturedAtIso,
      pagePath: '/fr/products/service-analytics',
      pageType: 'product',
      locale: 'fr',
      referrer: 'https://www.facebook.com/',
      utmSource: 'facebook',
      utmMedium: 'paid_social',
      utmCampaign: campaignId,
      utmTerm: adsetId,
      utmContent: adId,
      gaEventName: null,
      productId: null,
      productSlug: null,
      categoryId: null,
      categorySlug: null,
      brandId: null,
      brandSlug: null,
      orderId: null,
      searchTerm: null,
      quantity: null,
      value: null,
      currency: 'DZD',
      metadata: {
        storefrontProject: 'storefront',
        sessionStartedAt: capturedAtIso,
        viewportClass: 'mobile',
        hasMetaClickId: true,
      },
    };

    try {
      for (const [eventName, metadata] of [
        ['page_view', {}],
        ['ai_assistant_open', {}],
        ['ai_assistant_message', { intent: 'product_discovery' }],
        ['ai_assistant_result_click', { intent: 'product_discovery' }],
      ] as const) {
        await ingestStorefrontAnalyticsEvent(db, {
          ...commonEvent,
          eventId: `service-${eventName}:${runId}`,
          eventName,
          productId: eventName === 'ai_assistant_result_click' ? product.id : null,
          metadata: { ...commonEvent.metadata, ...metadata },
        });
      }
      await ingestStorefrontAnalyticsEvent(db, {
        ...commonEvent,
        eventId: `service-search-named:${runId}`,
        eventName: 'search',
        searchTerm: `drill-${runId}`,
        metadata: { ...commonEvent.metadata, resultsCount: 1 },
      });
      await ingestStorefrontAnalyticsEvent(db, {
        ...commonEvent,
        eventId: `service-search-unnamed:${runId}`,
        eventName: 'search',
        metadata: { ...commonEvent.metadata, resultsCount: 0 },
      });
      await ingestStorefrontAnalyticsEvent(db, {
        ...commonEvent,
        eventId: `service-assistant-feedback:${runId}`,
        eventName: 'ai_assistant_feedback',
        metadata: { ...commonEvent.metadata, rating: 'helpful' },
      });
      for (const status of ['completed', 'cancelled'] as const) {
        await ingestStorefrontAnalyticsEvent(db, {
          ...commonEvent,
          eventId: `service-assistant-run-${status}:${runId}`,
          eventName: 'ai_assistant_run',
          metadata: {
            ...commonEvent.metadata,
            intent: 'product_discovery',
            status,
            model: 'storefront-test-model',
            totalTokens: status === 'completed' ? 20 : 5,
          },
        });
      }

      const payload = storefrontOrderCreateRequestSchema.parse({
        phoneNumber1: '0550000004',
        cartProducts: [String(product.id)],
        visitId,
        journeyId,
        sessionId,
        marketing: {
          semanticsVersion: 'multi_destination_v1',
          eventId: `service-order-marketing:${runId}`,
          eventSourceUrl: 'https://bricomaitre.com/fr/checkout',
          sessionEntry: {
            sessionId,
            journeyId,
            landingPath: '/fr/products/service-analytics',
            referrer: 'https://www.facebook.com/',
            utmSource: 'facebook',
            utmMedium: 'paid_social',
            utmCampaign: campaignId,
            utmTerm: adsetId,
            utmContent: adId,
            hasMetaClickId: true,
            hasGoogleClickId: false,
            hasTikTokClickId: false,
            capturedAt: capturedAtIso,
          },
          assistant: {
            sourceSessionId: sessionId,
            journeyId,
            openedAt: capturedAtIso,
            engagedAt: capturedAtIso,
            recommendationClickedAt: capturedAtIso,
            clickedProductIds: [product.id],
            capturedAt: capturedAtIso,
          },
        },
      });
      const created = await createStorefrontOrder(db, payload);
      orderId = created.item.id;
      const [legacyOrder] = await db
        .insert(orders)
        .values({
          phoneNumber1: '0550000005',
          cartProducts: [`service-analytics-${runId}`],
          createdAt: capturedAt,
        })
        .returning({ id: orders.id });
      legacyOrderId = legacyOrder.id;

      expect(created.item.purchaseEventId).toBe(`service-order-marketing:${runId}`);
      await expect(readStorefrontOrderByToken(db, created.item.publicToken)).resolves.toMatchObject(
        {
          kind: 'ok',
          item: { purchaseEventId: `service-order-marketing:${runId}` },
        },
      );

      await expect(
        db.select().from(analyticsSessions).where(eq(analyticsSessions.id, sessionId)),
      ).resolves.toEqual([
        expect.objectContaining({
          channel: 'meta_paid',
          evidence: 'paid_utm',
          utmCampaign: campaignId,
        }),
      ]);
      await expect(
        db
          .select()
          .from(orderAcquisitionAttribution)
          .where(eq(orderAcquisitionAttribution.orderId, orderId)),
      ).resolves.toEqual([
        expect.objectContaining({
          semanticsVersion: 'order_acquisition_v2',
          channel: 'meta_paid',
          sourceSessionId: sessionId,
          metaCampaignId: campaignId,
          metaAdsetId: adsetId,
          metaAdId: adId,
        }),
      ]);
      await expect(
        db.select().from(orderAiInfluence).where(eq(orderAiInfluence.orderId, orderId)),
      ).resolves.toEqual([
        expect.objectContaining({
          level: 'recommended_product_ordered',
          sameSession: true,
          recommendedProductOrdered: true,
        }),
      ]);

      const utcDay = capturedAtIso.slice(0, 10);
      const reportingDay = dayInTimezone(capturedAt, ADMIN_REPORTING_TIMEZONE);
      const [startDate, endDate] = [utcDay, reportingDay].sort();
      // Retained Storefront rollups preserve their recorded UTC day while live commerce uses the
      // reporting day. Cover both when this test runs during Algiers' one-hour midnight boundary.
      const filters = { startDate, endDate };
      await expect(getLiveStorefrontAiStats(db, filters)).resolves.toMatchObject({
        opens: 1,
        messages: 1,
        resultClicks: 1,
        influencedOrders: 1,
        confirmedOrders: 0,
        paidOrders: 0,
      });
      const experience = await getStorefrontExperienceStats(db, filters);
      expect(experience.website.acquisitionSources).toContainEqual(
        expect.objectContaining({ name: 'meta_paid', sessions: 1, orders: 1 }),
      );
      const websiteProductMetrics = await db.execute(
        buildWebsiteProductMetricsQuery({
          range: 'custom',
          ...filters,
        }),
      );
      expect(websiteProductMetrics.rows).toContainEqual(
        expect.objectContaining({
          id: String(product.id),
          website_purchase_count: 2,
        }),
      );
      const acquisition = await loadMetaPerformance(
        db,
        resolveAnalyticsFilters(
          analyticsQuerySchema.parse({ view: 'acquisition', range: 'custom', ...filters }),
        ),
        await getProfitTrackerReport({ range: 'custom', ...filters }, { db }),
      );
      expect(acquisition.entities.ads).toContainEqual(
        expect.objectContaining({ id: adId, bricOrders: 1 }),
      );
      expect(acquisition.summary.bricOrders).toBeGreaterThanOrEqual(1);

      const afterRetention = new Date(capturedAt.getTime() + 8 * 24 * 60 * 60 * 1_000);
      await expect(rollUpNextExpiredAnalyticsDay(db, { now: afterRetention })).resolves.toBe(
        capturedAtIso.slice(0, 10),
      );
      const searchRollups = await db
        .select({ term: analyticsDailyRollups.dimensionKey })
        .from(analyticsDailyRollups)
        .where(eq(analyticsDailyRollups.dimension, 'search'));
      expect(searchRollups).toEqual(expect.arrayContaining([{ term: `drill-${runId}` }]));
      expect(searchRollups).not.toContainEqual({ term: 'Unknown' });
      expect(searchRollups).not.toContainEqual({ term: '' });
      await expect(deleteExpiredAnalyticsEventsBatch(db, { now: afterRetention })).resolves.toBe(3);
      await expect(deleteExpiredAnalyticsSessionsBatch(db, { now: afterRetention })).resolves.toBe(
        0,
      );
      await expect(
        db.select().from(analyticsSessions).where(eq(analyticsSessions.id, sessionId)),
      ).resolves.toEqual([expect.objectContaining({ id: sessionId })]);

      await expect(getLiveStorefrontAiStats(db, filters)).resolves.toMatchObject({
        opens: 1,
        messages: 1,
        resultClicks: 1,
        influencedOrders: 1,
        confirmedOrders: 0,
        paidOrders: 0,
      });
      const retainedExperience = await getStorefrontExperienceStats(db, filters);
      expect(retainedExperience.website.acquisitionSources).toContainEqual(
        expect.objectContaining({ name: 'meta_paid', sessions: 1, orders: 1 }),
      );
    } finally {
      if (orderId) await db.delete(orders).where(eq(orders.id, orderId));
      if (legacyOrderId) await db.delete(orders).where(eq(orders.id, legacyOrderId));
      await db.delete(analyticsJourneys).where(eq(analyticsJourneys.id, journeyId));
      await db.delete(products).where(eq(products.id, product.id));
    }
  });
});
