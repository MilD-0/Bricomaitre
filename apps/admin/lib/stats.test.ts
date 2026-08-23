import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import {
  buildAnalyticsWhere,
  buildCanonicalStorefrontSessionsQuery,
  buildLiveOrderSummaryQuery,
  buildLiveOrderTrendQuery,
  buildWebsiteProductMetricsQuery,
  getReportThroughDate,
  isFinancialDataLagging,
  isStatsSnapshotUsable,
  mergeCanonicalWebsitePurchases,
  mergeLiveOrderTrend,
  normalizeStatsDashboardData,
  statsQuerySchema,
} from './stats';
import { CUSTOMER_SUCCESSFUL_ORDER_STATUSES } from './stats-experience';
import {
  buildCartProductLookup,
  collectCartProductReferenceBuckets,
  getCartProductLookupKey,
} from './order-product-references';
import { manualOrderListQuerySchema } from './manual-orders';

describe('normalizeStatsDashboardData', () => {
  it('upgrades legacy snapshots with safe defaults for newer stats sections', () => {
    const normalized = normalizeStatsDashboardData(
      {
        filters: { range: '90d', startDate: '2026-04-22', endDate: '2026-07-20' },
        summary: { totalOrders: 12 },
        website: { sessions: 25, pageViews: 80 },
        metaAds: { events: [], recentPayloads: [] },
      },
      {
        range: '90d',
        startDate: '2026-04-22',
        endDate: '2026-07-20',
      },
    );

    expect(normalized.summary.totalOrders).toBe(12);
    expect(normalized.website.sessions).toBe(25);
    expect(normalized.website.trend).toEqual([]);
    expect(normalized.landingPages.summary.published).toBe(0);
    expect(normalized.aiAssistants.admin.runs).toBe(0);
    expect(normalized.customers.customers).toEqual([]);
    expect(normalized.metaAds.paidAttribution.topCampaigns).toEqual([]);
    expect(normalized.metaAds.commerce).toMatchObject({
      summary: { spend: 0, bricOrders: 0, paidOrders: 0 },
      rows: [],
      sync: null,
    });
  });
});

describe('reporting snapshot correctness', () => {
  it('does not certify financial freshness from an order-only trend tail', () => {
    const data = normalizeStatsDashboardData(
      {
        trends: {
          daily: [
            { bucket: '2026-08-12', orders: 10, revenue: 100, profit: 40, fees: 10 },
            { bucket: '2026-08-17', orders: 12, revenue: 0, profit: 0, fees: 0 },
          ],
          imports: [],
        },
      },
      { range: 'custom', startDate: '2026-08-01', endDate: '2026-08-17' },
    );

    expect(getReportThroughDate(data)).toBe('2026-08-12');
  });

  it('refuses expired snapshots', () => {
    const data = {
      ...normalizeStatsDashboardData(
        {},
        { range: '30d', startDate: '2026-07-19', endDate: '2026-08-17' },
      ),
      snapshot: {
        generatedAt: '2026-08-19T00:00:00.000Z',
        staleAt: '2026-08-20T00:00:00.000Z',
        isStale: true,
        trigger: 'test',
        sourceImportBatchId: null,
        reportThroughDate: null,
        financialDataIsLagging: false,
      },
    };
    expect(isStatsSnapshotUsable(data)).toBe(false);
    expect(isStatsSnapshotUsable({ ...data, snapshot: { ...data.snapshot!, isStale: false } })).toBe(
      true,
    );
  });
});

describe('statsQuerySchema', () => {
  it('accepts preset ranges without custom dates', () => {
    expect(statsQuerySchema.parse({ range: '90d' })).toEqual({ range: '90d' });
  });

  it('rejects invalid custom ranges', () => {
    expect(() => statsQuerySchema.parse({ range: 'custom' })).toThrowError(
      'Provide both custom dates.',
    );
    expect(() => statsQuerySchema.parse({ range: 'custom', startDate: '2026-08-01' })).toThrowError(
      'Provide both custom dates.',
    );
  });
});

describe('website analytics history scope', () => {
  it('serves session counts from permanent daily facts plus only the unrolled raw tail', () => {
    const query = new PgDialect().sqlToQuery(
      buildCanonicalStorefrontSessionsQuery({
        range: 'custom',
        startDate: '2026-05-20',
        endDate: '2026-08-17',
      }),
    );

    expect(query.sql).toContain('analytics_daily_rollups');
    expect(query.sql).toContain('analytics_acquisition_daily_rollups');
    expect(query.sql).toContain('count(distinct');
    expect(query.sql).toContain('not exists');
  });

  it('keeps comparable events from both storefront generations in the selected dates', () => {
    const where = buildAnalyticsWhere({
      range: 'custom',
      startDate: '2026-06-01',
      endDate: '2026-06-30',
    });
    const query = new PgDialect().sqlToQuery(where!);

    expect(query.sql).toContain('analytics_events');
    expect(query.sql).not.toContain('storefrontProject');
    expect(query.params).toEqual(['2026-06-01', '2026-06-30']);
  });

  it('combines canonical order lines with a non-duplicating legacy cart fallback', () => {
    const query = new PgDialect().sqlToQuery(
      buildWebsiteProductMetricsQuery({
        range: 'custom',
        startDate: '2026-08-16',
        endDate: '2026-08-17',
      }),
    );

    expect(query.sql).toContain('order_product_purchases as');
    expect(query.sql).toContain('from "order_line_items"');
    expect(query.sql).toContain('legacy_order_products as');
    expect(query.sql).toContain('unnest("orders"."cart_products")');
    expect(query.sql).toContain('"products"."slug" = trim(product_ref)');
    expect(query.sql).toContain('not exists');
    expect(query.sql).toContain('count(distinct order_id)');
    expect(query.sql).toContain('full join order_product_purchases');
    expect(query.params).toEqual(expect.arrayContaining(['Africa/Algiers']));
  });
});

describe('live order reporting', () => {
  const filters = {
    range: 'custom' as const,
    startDate: '2026-08-16',
    endDate: '2026-08-17',
  };
  const dialect = new PgDialect();

  it('counts canonical orders in the reporting timezone and current success states', () => {
    const query = dialect.sqlToQuery(buildLiveOrderSummaryQuery(filters));

    expect(query.sql).toContain('from "orders"');
    expect(query.sql).toContain('at time zone');
    expect(query.sql).toContain('count(*) filter');
    expect(query.params).toEqual(
      expect.arrayContaining([
        'Africa/Algiers',
        '2026-08-16',
        '2026-08-17',
        ...CUSTOMER_SUCCESSFUL_ORDER_STATUSES,
      ]),
    );
  });

  it('builds daily, weekly, and monthly operational order trends from one filtered scan', () => {
    const query = dialect.sqlToQuery(buildLiveOrderTrendQuery(filters));

    expect(query.sql).toContain('with filtered_orders as');
    expect(query.sql).toContain("select 'daily' as grain");
    expect(query.sql).toContain("select 'weekly' as grain");
    expect(query.sql).toContain("select 'monthly' as grain");
    expect(query.sql.match(/from filtered_orders/g)).toHaveLength(3);
  });

  it('replaces imported order counts without discarding financial trend values', () => {
    expect(
      mergeLiveOrderTrend(
        [
          { bucket: '2026-08-15', orders: 4, revenue: 900, profit: 200, fees: 100 },
          { bucket: '2026-08-16', orders: 0, revenue: 1200, profit: 350, fees: 150 },
        ],
        [
          { bucket: '2026-08-16', orders: 52 },
          { bucket: '2026-08-17', orders: 14 },
        ],
      ),
    ).toEqual([
      { bucket: '2026-08-15', orders: 0, revenue: 900, profit: 200, fees: 100 },
      { bucket: '2026-08-16', orders: 52, revenue: 1200, profit: 350, fees: 150 },
      { bucket: '2026-08-17', orders: 14, revenue: 0, profit: 0, fees: 0 },
    ]);
  });

  it('uses canonical submissions throughout the website funnel summary', () => {
    const website = normalizeStatsDashboardData(
      {
        website: {
          sessions: 100,
          addToCarts: 30,
          checkoutStarts: 20,
          purchases: 0,
          funnel: [
            { name: 'Sessions', value: 100 },
            { name: 'Purchases', value: 0 },
          ],
        },
      },
      filters,
    ).website;

    expect(mergeCanonicalWebsitePurchases(website, 10)).toMatchObject({
      purchases: 10,
      sessionConversionRate: 10,
      cartToPurchaseRate: 33.33,
      checkoutToPurchaseRate: 50,
      funnel: [
        { name: 'Sessions', value: 100 },
        { name: 'Purchases', value: 10 },
      ],
    });
  });

  it('uses canonical daily order counts in the website outcome trend', () => {
    const website = normalizeStatsDashboardData(
      {
        website: {
          sessions: 100,
          purchases: 3,
          trend: [
            {
              bucket: '2026-08-16',
              sessions: 40,
              pageViews: 120,
              purchases: 1,
              errors: 2,
            },
          ],
        },
      },
      filters,
    ).website;

    expect(
      mergeCanonicalWebsitePurchases(website, 12, [
        { bucket: '2026-08-16', orders: 8 },
        { bucket: '2026-08-17', orders: 4 },
      ]).trend,
    ).toEqual([
      {
        bucket: '2026-08-16',
        sessions: 40,
        pageViews: 120,
        purchases: 8,
        errors: 2,
      },
      {
        bucket: '2026-08-17',
        sessions: 0,
        pageViews: 0,
        purchases: 4,
        errors: 0,
      },
    ]);
  });

  it('allows ordinary settlement lag but flags materially stale financial coverage', () => {
    expect(isFinancialDataLagging('2026-08-14', '2026-08-17')).toBe(false);
    expect(isFinancialDataLagging('2026-08-13', '2026-08-17')).toBe(true);
    expect(isFinancialDataLagging(null, '2026-08-17')).toBe(true);
    expect(isFinancialDataLagging('2026-06-30', '')).toBe(false);
  });
});

describe('manualOrderListQuerySchema', () => {
  it('parses paginated manual-order queries', () => {
    expect(manualOrderListQuerySchema.parse({ page: '2', limit: '10' })).toEqual({
      page: 2,
      limit: 10,
    });
  });
});

describe('cart product reference matching', () => {
  it('classifies numeric and mongo cart product references the same way as orders', () => {
    expect(getCartProductLookupKey('12')).toBe('id:12');
    expect(getCartProductLookupKey('f00000000000000000000005')).toBe(
      'mongo:f00000000000000000000005',
    );
    expect(getCartProductLookupKey('Desk Lamp')).toBeNull();
  });

  it('collects unique numeric ids and mongo ids from cart products', () => {
    expect(
      collectCartProductReferenceBuckets([
        { cartProducts: ['12', 'f00000000000000000000005', '12'] },
        { cartProducts: [' 7 ', 'f00000000000000000000005', 'custom text'] },
        { cartProducts: null },
      ]),
    ).toEqual({
      productIds: [12, 7],
      mongoIds: ['f00000000000000000000005'],
    });
  });

  it('builds a product lookup that resolves by numeric id and mongo id', () => {
    const lookup = buildCartProductLookup([
      { id: 12, mongoId: 'f00000000000000000000005', title: 'Legacy Lamp' },
      { id: 7, mongoId: null, title: 'Desk' },
    ]);

    expect(lookup.get('id:12')).toMatchObject({ title: 'Legacy Lamp' });
    expect(lookup.get('mongo:f00000000000000000000005')).toMatchObject({ id: 12 });
    expect(lookup.get('id:7')).toMatchObject({ title: 'Desk' });
  });
});
