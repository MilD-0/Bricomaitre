import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import * as XLSX from 'xlsx';

import { getDb, getPool } from '@bric/db/client';
import {
  analyticsJourneys,
  analyticsDailyRollups,
  analyticsSessions,
  importBatches,
  orderAcquisitionAttribution,
  orderAiInfluence,
  orderLineItems,
  orders,
  processedOrders,
  products,
} from '@bric/db/schema';
import {
  beginIdempotentRequest,
  buildIdempotencyFingerprint,
  clearIdempotentRequest,
  completeIdempotentRequest,
  readIdempotencyRecord,
} from '@bric/runtime/idempotency';
import { applyRateLimit } from '@bric/runtime/rate-limit';
import { getRedis } from '@bric/runtime/redis';
import { storefrontOrderCreateRequestSchema } from '@bric/storefront-core/contracts';
import { claimStorefrontOrderIdempotency } from '@bric/storefront-core/order-idempotency';
import {
  ingestStorefrontAnalyticsEvent,
  type StorefrontAnalyticsEvent,
} from '@bric/storefront-core/analytics';
import {
  deleteExpiredAnalyticsEventsBatch,
  deleteExpiredAnalyticsSessionsBatch,
  rollUpNextExpiredAnalyticsDay,
} from '@bric/storefront-core/maintenance';
import { createStorefrontOrder, readStorefrontOrderByToken } from '@bric/storefront-core/orders';
import { dayInTimezone } from '../lib/analytics/date-range';
import { getMetaCommercePerformance, getMetaCommerceReport } from '../lib/meta-commerce-analytics';
import { buildWebsiteProductMetricsQuery } from '../lib/stats';
import {
  ADMIN_REPORTING_TIMEZONE,
  getExperienceStats,
  getLiveStorefrontAiStats,
} from '../lib/stats-experience';
import { deleteImportBatch, importStatsSpreadsheet } from '../lib/stats-order-import';
import { queryAdminOrders } from '../lib/admin-ai-order-query';
import { loadOrdersPageData } from '../lib/admin-orders-data';

const runId = randomUUID();

describe('real PostgreSQL and Redis contracts', () => {
  afterAll(async () => {
    await Promise.allSettled([getRedis().quit(), getPool().end()]);
  });

  it('searches saved and current product identities without duplicating orders or grouped units', async () => {
    const db = getDb();
    const marker = `search-${runId}`;
    const [product] = await db
      .insert(products)
      .values({
        title: `Équilibreur ${marker}`,
        titleAr: `حامل محرك ${marker}`,
        sku: `TC0725-${runId}`,
        slug: `renamed-${marker}`,
        price: '100.00',
      })
      .returning();
    const fixtures = await db
      .insert(orders)
      .values([
        { phoneNumber1: '0550000001' },
        { phoneNumber1: '0550000002' },
        { phoneNumber1: '0550000003', note: marker },
      ])
      .returning();
    const [first, second, unrelated] = fixtures;
    try {
      await db.insert(orderLineItems).values(
        [
          {
            orderId: first!.id,
            productId: product!.id,
            contentId: 'current',
            titleSnapshot: `Old title ${marker}`,
            quantity: 2,
          },
          {
            orderId: first!.id,
            productId: null,
            contentId: 'deleted',
            titleSnapshot: `Équilibreur ${marker}`,
            quantity: 3,
          },
          {
            orderId: second!.id,
            productId: product!.id,
            contentId: 'current',
            titleSnapshot: `Old title ${marker}`,
            quantity: 1,
          },
        ].map((line) => ({
          ...line,
          rawValue: line.contentId,
          originalUnitPrice: '100.00',
          effectiveUnitPrice: '100.00',
          lineTotal: String(line.quantity * 100),
        })),
      );

      for (const search of [`equilibreUR ${marker}`, `حامل محرك ${marker}`, product!.sku!]) {
        const result = await queryAdminOrders({ search, limit: 1 });
        expect(result.pagination.totalItems).toBe(2);
        expect(result.items).toHaveLength(1);
        const next = await queryAdminOrders({ search, limit: 1, page: 2 });
        expect(
          new Set([...result.items, ...next.items].map((row) => ('id' in row ? row.id : null))),
        ).toEqual(new Set([first!.id, second!.id]));
      }
      const grouped = await queryAdminOrders({
        search: `equilibreur ${marker}`,
        groupBy: { dimension: 'product' },
      });
      expect(grouped).toMatchObject({
        matchedOrders: 2,
        items: expect.arrayContaining([
          expect.objectContaining({ productId: product!.id, orderCount: 2, units: 3 }),
          expect.objectContaining({ productId: null, orderCount: 1, units: 3 }),
        ]),
      });
      const page = await loadOrdersPageData({ search: `equilibreur ${marker}` }, false);
      expect(page.items.map((row) => row.id).sort()).toEqual([first!.id, second!.id].sort());
      const note = await queryAdminOrders({ search: marker });
      expect(note.pagination.totalItems).toBe(3);
      expect(note.items).toContainEqual(expect.objectContaining({ id: unrelated!.id }));
      const absent = await queryAdminOrders({ search: `absent-${marker}` });
      expect(absent.pagination.totalItems).toBe(0);

      await db.delete(products).where(eq(products.id, product!.id));
      const deleted = await queryAdminOrders({ search: `equilibreur ${marker}` });
      expect(deleted.pagination.totalItems).toBe(1);
      expect(deleted.items).toContainEqual(expect.objectContaining({ id: first!.id }));
    } finally {
      await db.delete(orders).where(
        inArray(
          orders.id,
          fixtures.map((row) => row.id),
        ),
      );
      await db.delete(products).where(eq(products.id, product!.id));
    }
  });

  it('applies migrations to a queryable PostgreSQL schema', async () => {
    const result = await getPool().query<{
      products: string | null;
      migrations: string | null;
      analyticsCategoryIndex: string | null;
      metaAnalyticsEventIndex: string | null;
    }>(`
      select
        to_regclass('public.products')::text as products,
        to_regclass('drizzle.__drizzle_migrations')::text as migrations,
        to_regclass('public.idx_analytics_events_category')::text as "analyticsCategoryIndex",
        to_regclass('public.idx_meta_event_outbox_analytics_event')::text as "metaAnalyticsEventIndex"
    `);

    expect(result.rows[0]).toEqual({
      products: 'products',
      migrations: 'drizzle.__drizzle_migrations',
      analyticsCategoryIndex: 'idx_analytics_events_category',
      metaAnalyticsEventIndex: 'idx_meta_event_outbox_analytics_event',
    });
  });

  it('keeps stable catalog values protected by database constraints', async () => {
    const expected = [
      'brands_conversion_rate_nonnegative_check',
      'brands_engagement_counters_nonnegative_check',
      'brands_popularity_score_nonnegative_check',
      'categories_conversion_rate_nonnegative_check',
      'categories_engagement_counters_nonnegative_check',
      'categories_popularity_score_nonnegative_check',
      'products_availability_matches_stock_check',
      'products_availability_status_check',
      'products_conversion_rate_nonnegative_check',
      'products_engagement_counters_nonnegative_check',
      'products_inventory_quantity_nonnegative_check',
      'products_old_price_nonnegative_check',
      'products_popularity_score_nonnegative_check',
      'products_price_nonnegative_check',
      'products_purchase_price_nonnegative_check',
    ];
    const result = await getPool().query<{ conname: string }>(
      `select conname from pg_constraint where conname = any($1::text[]) order by conname`,
      [expected],
    );

    expect(result.rows.map((row) => row.conname)).toEqual(expected);
  });

  it('rejects product availability that contradicts stock state', async () => {
    await expect(
      getPool().query(
        `insert into products (title, slug, price, in_stock, availability_status)
         values ($1, $2, $3, true, 'out_of_stock')`,
        ['Contradictory stock fixture', `contradictory-stock-${runId}`, '100.00'],
      ),
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'products_availability_matches_stock_check',
    });
  });

  it('preserves idempotency under concurrent Redis claims', async () => {
    const scope = `service-test:${runId}`;
    const key = 'concurrent-request';
    const fingerprint = buildIdempotencyFingerprint({ orderId: 42 });

    const claims = await Promise.all([
      beginIdempotentRequest({ scope, key, fingerprint, ttlSeconds: 60 }),
      beginIdempotentRequest({ scope, key, fingerprint, ttlSeconds: 60 }),
    ]);

    expect(claims.filter((claim) => claim.kind === 'started')).toHaveLength(1);
    expect(claims.filter((claim) => claim.kind === 'existing')).toHaveLength(1);

    await completeIdempotentRequest({
      scope,
      key,
      fingerprint,
      statusCode: 201,
      body: { orderId: 42 },
      ttlSeconds: 60,
    });
    await expect(readIdempotencyRecord(scope, key)).resolves.toMatchObject({
      status: 'completed',
      fingerprint,
      response: { statusCode: 201, body: { orderId: 42 } },
    });

    await clearIdempotentRequest(scope, key);
  });

  it('enforces rate-limit counters in Redis', async () => {
    const options = {
      scope: `service-test:${runId}`,
      key: 'rate-limit',
      limit: 1,
      windowSeconds: 60,
    };

    await expect(applyRateLimit(options)).resolves.toMatchObject({ ok: true, remaining: 0 });
    await expect(applyRateLimit(options)).resolves.toMatchObject({ ok: false, remaining: 0 });
  });

  it('commits an order and its durable idempotency result atomically', async () => {
    const db = getDb();
    const keyHash = `service-order:${runId}`;
    const fingerprint = buildIdempotencyFingerprint({ phoneNumber1: '0550000001' });
    const payload = storefrontOrderCreateRequestSchema.parse({ phoneNumber1: '0550000001' });

    await expect(
      claimStorefrontOrderIdempotency(db, {
        keyHash,
        fingerprint,
        processingTtlSeconds: 60,
      }),
    ).resolves.toEqual({ kind: 'started' });

    const created = await createStorefrontOrder(db, payload, {
      idempotency: { keyHash, fingerprint },
    });

    try {
      expect(created.item).toMatchObject({
        phoneNumber1: '0550000001',
        variant: 'degraded_capture',
      });
      expect(created.item.statusHistory).toHaveLength(1);
      await expect(
        claimStorefrontOrderIdempotency(db, {
          keyHash,
          fingerprint,
          processingTtlSeconds: 60,
        }),
      ).resolves.toMatchObject({ kind: 'completed', orderId: created.item.id });
    } finally {
      await db.delete(orders).where(eq(orders.id, created.item.id));
    }
  });

  it('rolls back order creation when its durable idempotency claim is missing', async () => {
    const db = getDb();
    const phoneNumber1 = '0550000002';
    const payload = storefrontOrderCreateRequestSchema.parse({ phoneNumber1 });

    await expect(
      createStorefrontOrder(db, payload, {
        idempotency: {
          keyHash: `missing-service-order:${runId}`,
          fingerprint: buildIdempotencyFingerprint({ phoneNumber1 }),
        },
      }),
    ).rejects.toThrow('Unable to complete the durable order idempotency record.');

    await expect(
      db.select({ id: orders.id }).from(orders).where(eq(orders.phoneNumber1, phoneNumber1)),
    ).resolves.toEqual([]);
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
        runs: 2,
        completed: 1,
        cancelled: 1,
        successRate: 100,
        helpful: 1,
        notHelpful: 0,
        helpfulRate: 100,
        influencedOrders: 1,
        recommendedProductOrders: 1,
      });
      const experience = await getExperienceStats(db, filters);
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
      await expect(getMetaCommercePerformance(db, filters, true)).resolves.toContainEqual(
        expect.objectContaining({
          campaignId,
          adsetId,
          adId,
          bricOrders: 1,
          submittedValueDzd: 8000,
        }),
      );
      await expect(getMetaCommerceReport(db, filters, false)).resolves.toMatchObject({
        summary: {
          spend: 0,
          bricOrders: 1,
          confirmedOrders: 0,
          paidOrders: 0,
          submittedValueDzd: 8000,
        },
      });

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
        runs: 2,
        completed: 1,
        cancelled: 1,
        successRate: 100,
        helpful: 1,
        notHelpful: 0,
        helpfulRate: 100,
        influencedOrders: 1,
        recommendedProductOrders: 1,
      });
      const retainedExperience = await getExperienceStats(db, filters);
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

  it('imports settlement rows without rebuilding dashboard snapshots synchronously', async () => {
    const db = getDb();
    const tracking = `SERVICE-${runId}`;
    const fileName = `service-stats-${runId}.xlsx`;
    const [order] = await db
      .insert(orders)
      .values({ phoneNumber1: '0550000003', firstName: 'Service', cartProducts: [] })
      .returning({ id: orders.id });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ['Référence', 'Tracking', 'Montant', 'Frais de livraison', 'Net recouvrement'],
        [String(order.id), tracking, 1500, 200, 1300],
      ]),
      'Settlement',
    );
    let batchId: string | null = null;

    try {
      const result = await importStatsSpreadsheet(
        XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer,
        fileName,
      );
      batchId = result.batchId;

      expect(result).toEqual({
        batchId: result.batchId,
        newOrders: 1,
        duplicateOrders: 0,
        unmatchedReferences: [],
      });
      await expect(
        db
          .select({ orderId: processedOrders.orderId, tracking: processedOrders.tracking })
          .from(processedOrders)
          .where(eq(processedOrders.tracking, tracking)),
      ).resolves.toEqual([{ orderId: String(order.id), tracking }]);
    } finally {
      if (batchId) {
        await deleteImportBatch(batchId);
      } else {
        const batches = await db
          .select({ batchId: importBatches.batchId })
          .from(importBatches)
          .where(eq(importBatches.fileName, fileName));
        for (const batch of batches) {
          await deleteImportBatch(batch.batchId);
        }
      }
      await db.delete(orders).where(eq(orders.id, order.id));
    }
  });
});
