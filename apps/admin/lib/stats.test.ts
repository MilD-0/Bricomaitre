import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';

import { manualOrderListQuerySchema } from './manual-orders';
import {
  buildCartProductLookup,
  collectCartProductReferenceBuckets,
  getCartProductLookupKey,
} from './order-product-references';
import { statsQuerySchema, type WebsiteAnalyticsData } from './stats-contract';
import { emptyExperienceStats } from './stats-experience-shared';
import {
  buildAnalyticsWhere,
  buildResolvedFilters,
  getCanonicalStorefrontSessionCount,
  getLiveWebsiteProductMetrics,
  buildCanonicalStorefrontSessionsQuery,
  buildWebsiteProductMetricsQuery,
  mergeCanonicalWebsitePurchases,
} from './stats-live-commerce';
const emptyWebsite: WebsiteAnalyticsData = {
  sessions: 0,
  journeys: 0,
  pageViews: 0,
  productViews: 0,
  addToCarts: 0,
  checkoutStarts: 0,
  purchases: 0,
  searches: 0,
  zeroResultSearches: 0,
  sessionConversionRate: 0,
  viewToCartRate: 0,
  cartToPurchaseRate: 0,
  checkoutToPurchaseRate: 0,
  topSearches: [],
  funnel: [],
  topProducts: [],
  ...emptyExperienceStats().website,
};

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

it('represents a clipped empty internal range without querying or rejecting it', async () => {
  const db = { execute: vi.fn() };
  const input = { range: 'custom' as const, startDate: '2026-09-06', endDate: '2026-09-01' };
  await expect(getCanonicalStorefrontSessionCount(db as never, input)).resolves.toBe(0);
  await expect(getLiveWebsiteProductMetrics(db as never, input)).resolves.toEqual([]);
  expect(db.execute).not.toHaveBeenCalled();
  expect(buildResolvedFilters({ range: 'all', endDate: '2026-09-01' })).toEqual({
    range: 'all',
    startDate: '',
    endDate: '2026-09-01',
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
  it('uses canonical submissions throughout the website funnel summary', () => {
    const website = {
      ...emptyWebsite,
      sessions: 100,
      addToCarts: 30,
      checkoutStarts: 20,
      purchases: 0,
      funnel: [
        { name: 'Sessions', value: 100 },
        { name: 'Purchases', value: 0 },
      ],
    };

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
    const website = {
      ...emptyWebsite,
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
    };

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
    expect(getCartProductLookupKey('696b80ad978cdf3fa9f5915a')).toBe(
      'mongo:696b80ad978cdf3fa9f5915a',
    );
    expect(getCartProductLookupKey('catalog-demo-lamp')).toBe('reference:catalog-demo-lamp');
    expect(getCartProductLookupKey('abo:B000DEMO')).toBe('reference:abo:B000DEMO');
    expect(getCartProductLookupKey(' ')).toBeNull();
  });

  it('collects unique numeric ids and mongo ids from cart products', () => {
    expect(
      collectCartProductReferenceBuckets([
        { cartProducts: ['12', '696b80ad978cdf3fa9f5915a', '12'] },
        { cartProducts: [' 7 ', '696b80ad978cdf3fa9f5915a', 'custom text'] },
        { cartProducts: null },
      ]),
    ).toEqual({
      productIds: [12, 7],
      mongoIds: ['696b80ad978cdf3fa9f5915a', 'custom text'],
      slugs: ['custom text'],
    });
  });

  it('builds a product lookup that resolves by numeric id and mongo id', () => {
    const lookup = buildCartProductLookup([
      { id: 12, mongoId: '696b80ad978cdf3fa9f5915a', title: 'Legacy Lamp' },
      { id: 7, mongoId: null, slug: 'catalog-demo-desk', title: 'Desk' },
    ]);

    expect(lookup.get('id:12')).toMatchObject({ title: 'Legacy Lamp' });
    expect(lookup.get('mongo:696b80ad978cdf3fa9f5915a')).toMatchObject({ id: 12 });
    expect(lookup.get('id:7')).toMatchObject({ title: 'Desk' });
    expect(lookup.get('reference:catalog-demo-desk')).toMatchObject({ id: 7 });
  });

  it('prefers a legacy catalog identifier over an ambiguous slug regardless of row order', () => {
    const rows = [
      { id: 1, mongoId: 'abo:B000DEMO', slug: 'original' },
      { id: 2, mongoId: null, slug: 'abo:B000DEMO' },
    ];
    for (const ordered of [rows, [...rows].reverse()]) {
      expect(
        buildCartProductLookup(ordered).get(getCartProductLookupKey('abo:B000DEMO')!),
      ).toMatchObject({ id: 1 });
    }
  });
});
