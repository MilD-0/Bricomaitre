import {
  SEMANTIC_ANALYTICS_CATALOG,
  semanticAnalyticsComparisonSchema,
  semanticAnalyticsQuerySchema,
  type SemanticAnalyticsQuery,
} from '@bric/ai-core';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';

import { getDb } from '@bric/db/client';
import {
  analyticsDailyRollups,
  analyticsDistinctDailyMembers,
  analyticsEvents,
  brands,
  categories,
  orders,
  processedOrders,
  products,
} from '@bric/db/schema';
import { CONFIRMED_LIFECYCLE_ORDER_STATUSES } from '@bric/storefront-core/order-domain';
import { getMetaCommercePerformance } from './meta-commerce-analytics';

type AnalyticsAccess = { canViewProfit: boolean };

export function confirmedLifecycleOrderCondition() {
  return inArray(orders.confirmed, [...CONFIRMED_LIFECYCLE_ORDER_STATUSES]);
}

function dateConditions(
  column: typeof orders.createdAt | typeof analyticsEvents.occurredAt,
  query: SemanticAnalyticsQuery,
) {
  return [
    query.startDate ? sql`${column} >= ${query.startDate}::date` : undefined,
    query.endDate ? sql`${column} < (${query.endDate}::date + interval '1 day')` : undefined,
  ];
}

function response(
  query: SemanticAnalyticsQuery,
  data: unknown,
  input: {
    source: string;
    definitions: Record<string, string>;
    caveats?: string[];
    currency?: string;
  },
) {
  return {
    query: query.query,
    filters: {
      startDate: query.startDate ?? null,
      endDate: query.endDate ?? null,
      productId: query.productId ?? null,
      categoryId: query.categoryId ?? null,
      brandId: query.brandId ?? null,
      confirmedOnly: query.confirmedOnly,
    },
    source: input.source,
    currency: input.currency ?? 'DZD',
    generatedAt: new Date().toISOString(),
    definition: SEMANTIC_ANALYTICS_CATALOG[query.query],
    metricDefinitions: input.definitions,
    caveats: input.caveats ?? [],
    data,
  };
}

export async function executeSemanticAnalytics(raw: unknown, access: AnalyticsAccess) {
  const query = semanticAnalyticsQuerySchema.parse(raw);
  const db = getDb();

  if (query.query === 'catalog_summary') {
    const [data] = await db
      .select({
        products: sql<number>`count(*)::int`,
        activeProducts: sql<number>`count(*) filter (where ${products.active})::int`,
        inStockProducts: sql<number>`count(*) filter (where ${products.active} and ${products.inStock})::int`,
        outOfStockProducts: sql<number>`count(*) filter (where ${products.active} and not ${products.inStock})::int`,
        inventoryUnits: sql<number>`coalesce(sum(${products.inventoryQuantity}), 0)::int`,
        inventoryRetailValue: sql<number>`coalesce(sum(${products.price} * ${products.inventoryQuantity}), 0)::double precision`,
        inventoryCostValue: access.canViewProfit
          ? sql<number>`coalesce(sum(${products.purchasePrice} * ${products.inventoryQuantity}), 0)::double precision`
          : sql<null>`null`,
      })
      .from(products);
    return response(query, data, {
      source: 'products',
      definitions: {
        inventoryRetailValue: 'Current price × inventory quantity.',
        inventoryCostValue: access.canViewProfit
          ? 'Purchase price × inventory quantity.'
          : 'Restricted for this user.',
      },
    });
  }

  if (query.query === 'sales_summary') {
    const statsDate = sql`coalesce(${processedOrders.encaissedAt}, ${processedOrders.deliveredAt}, ${processedOrders.orderCreatedAt})`;
    const conditions = [
      query.startDate ? sql`${statsDate}::date >= ${query.startDate}` : undefined,
      query.endDate ? sql`${statsDate}::date <= ${query.endDate}` : undefined,
    ];
    const [data] = await db
      .select({
        orders: sql<number>`count(*)::int`,
        amountCollected: sql<number>`coalesce(sum(${processedOrders.amountCollected}), 0)::double precision`,
        netRevenue: sql<number>`coalesce(sum(${processedOrders.netRevenue}), 0)::double precision`,
        totalFees: sql<number>`coalesce(sum(${processedOrders.totalFees}), 0)::double precision`,
        productCost: access.canViewProfit
          ? sql<number>`coalesce(sum(${processedOrders.productCost}), 0)::double precision`
          : sql<null>`null`,
        profit: access.canViewProfit
          ? sql<number>`coalesce(sum(${processedOrders.profit}), 0)::double precision`
          : sql<null>`null`,
        averageNetRevenue: sql<number>`coalesce(avg(${processedOrders.netRevenue}), 0)::double precision`,
      })
      .from(processedOrders)
      .where(and(...conditions));
    return response(query, data, {
      source: 'admin.processed_orders',
      definitions: {
        netRevenue: 'Collected amount minus delivery/provider fees.',
        profit: access.canViewProfit
          ? 'Net revenue minus imported product cost.'
          : 'Restricted for this user.',
      },
      caveats: ['Uses imported processed orders, not every newly submitted storefront order.'],
    });
  }

  if (query.query === 'order_summary') {
    const conditions = [
      ...dateConditions(orders.createdAt, query),
      query.confirmedOnly ? confirmedLifecycleOrderCondition() : undefined,
    ];
    const [data] = await db
      .select({
        orders: sql<number>`count(*)::int`,
        confirmedOrders: sql<number>`count(*) filter (where ${confirmedLifecycleOrderCondition()})::int`,
        confirmationRate: sql<number>`coalesce(count(*) filter (where ${confirmedLifecycleOrderCondition()})::double precision / nullif(count(*), 0), 0)`,
        grossOrderValue: sql<number>`coalesce(sum(${orders.price}), 0)::double precision`,
        averageOrderValue: sql<number>`coalesce(avg(${orders.price}), 0)::double precision`,
        discountedOrders: sql<number>`count(*) filter (where ${orders.promoDiscountAmount} > 0)::int`,
        discountAmount: sql<number>`coalesce(sum(${orders.promoDiscountAmount}), 0)::double precision`,
      })
      .from(orders)
      .where(and(...conditions));
    return response(query, data, {
      source: 'orders',
      definitions: {
        confirmationRate: 'Confirmed active orders ÷ active orders.',
        grossOrderValue: 'Sum of stored order price.',
      },
      caveats: [
        'Order value is submitted value; use sales_summary for imported fulfilled-order economics.',
      ],
    });
  }

  if (query.query === 'funnel_summary') {
    const conditions = dateConditions(analyticsEvents.occurredAt, query);
    const unrolled = and(
      ...conditions,
      sql`not exists (
      select 1 from ${analyticsDailyRollups} rollup
      where rollup.day = (${analyticsEvents.occurredAt} at time zone 'UTC')::date
        and rollup.dimension = 'overall' and rollup.dimension_key = ''
    )`,
    );
    const result = await db.execute(sql`
      with exact_sessions as (
        select ${analyticsDistinctDailyMembers.memberId} as session_id
        from ${analyticsDistinctDailyMembers}
        where ${analyticsDistinctDailyMembers.metric} = 'session'
          and ${analyticsDistinctDailyMembers.dimensionKey} = ''
          and ${query.startDate ? sql`${analyticsDistinctDailyMembers.day} >= ${query.startDate}::date` : sql`true`}
          and ${query.endDate ? sql`${analyticsDistinctDailyMembers.day} <= ${query.endDate}::date` : sql`true`}
        union
        select ${analyticsEvents.sessionId}
        from ${analyticsEvents}
        where ${unrolled} and ${analyticsEvents.eventName} = 'page_view'
      ), raw_counts as (
        select
          count(*) filter (where ${analyticsEvents.eventName} = 'view_item')::int as product_views,
          count(*) filter (where ${analyticsEvents.eventName} = 'add_to_cart')::int as add_to_carts,
          count(*) filter (where ${analyticsEvents.eventName} = 'begin_checkout')::int as checkout_starts,
          count(distinct coalesce(${analyticsEvents.orderId}::text, ${analyticsEvents.eventId}))
            filter (where ${analyticsEvents.eventName} = 'purchase')::int as purchases
        from ${analyticsEvents} where ${unrolled}
      ), rolled_counts as (
        select
          coalesce(sum(${analyticsDailyRollups.productViews}), 0)::int as product_views,
          coalesce(sum(${analyticsDailyRollups.addToCarts}), 0)::int as add_to_carts,
          coalesce(sum(${analyticsDailyRollups.checkoutStarts}), 0)::int as checkout_starts,
          coalesce(sum(${analyticsDailyRollups.purchases}), 0)::int as purchases
        from ${analyticsDailyRollups}
        where ${analyticsDailyRollups.dimension} = 'overall'
          and ${query.startDate ? sql`${analyticsDailyRollups.day} >= ${query.startDate}::date` : sql`true`}
          and ${query.endDate ? sql`${analyticsDailyRollups.day} <= ${query.endDate}::date` : sql`true`}
      )
      select
        (select count(*)::int from exact_sessions) as sessions,
        raw_counts.product_views + rolled_counts.product_views as "productViews",
        raw_counts.add_to_carts + rolled_counts.add_to_carts as "addToCarts",
        raw_counts.checkout_starts + rolled_counts.checkout_starts as "checkoutStarts",
        raw_counts.purchases + rolled_counts.purchases as purchases
      from raw_counts cross join rolled_counts
    `);
    const row = result.rows[0] as {
      sessions: number;
      productViews: number;
      addToCarts: number;
      checkoutStarts: number;
      purchases: number;
    };
    const rate = (numerator: number, denominator: number) =>
      denominator > 0 ? numerator / denominator : 0;
    const data = {
      ...row,
      viewToCartRate: rate(row.addToCarts, row.productViews),
      cartToCheckoutRate: rate(row.checkoutStarts, row.addToCarts),
      checkoutToPurchaseRate: rate(row.purchases, row.checkoutStarts),
      sessionPurchaseRate: rate(row.purchases, row.sessions),
    };
    return response(query, data, {
      source: 'analytics_events + analytics_daily_rollups',
      definitions: {
        viewToCartRate: 'Add-to-cart events ÷ product-view events.',
        sessionPurchaseRate: 'Purchase events ÷ sessions with page views.',
      },
      caveats: ['Event counts are not unique users and may include repeated actions.'],
    });
  }

  if (query.query === 'meta_commerce_performance') {
    const data = await getMetaCommercePerformance(
      db,
      {
        startDate: query.startDate,
        endDate: query.endDate,
        limit: query.limit,
      },
      access.canViewProfit,
    );
    return response(query, data, {
      source:
        'meta_ads_daily_insights + order_acquisition_attribution + orders + order_line_items + admin.ecotrack_order_states + admin.processed_orders',
      currency: 'mixed',
      definitions: {
        spend: 'Meta ad-account currency, identified by accountCurrency on each row.',
        metaPurchases:
          'Meta-attributed website purchases under the stored account attribution setting.',
        bricOrders:
          'First-party orders matched through the durable campaign, ad-set, and ad snapshot.',
        paidOrders: 'Orders whose current ECOTRACK state is paye_et_archive.',
        submittedValueDzd: 'First-party submitted product value in DZD.',
        realizedProfitDzd: access.canViewProfit
          ? 'Profit from the imported settlement record, in DZD.'
          : 'Restricted for this user.',
      },
      caveats: [
        'Spend and Bricomaitre revenue may use different currencies; no cross-currency ROAS is inferred.',
        'Orders are assigned to the business day of the captured campaign touch, not the fulfillment day.',
        'Live acquisition coverage uses order_acquisition_v2: immutable session entry plus seven-day last-non-direct attribution with explicit evidence. Recent older paid cohorts are reconstructed only where retained visit evidence exists.',
        'Settlement fields remain incomplete until the ECOTRACK settlement/import feed is current.',
      ],
    });
  }

  if (query.query === 'product_performance') {
    const data = await db
      .select({
        id: products.id,
        title: products.title,
        sku: products.sku,
        brand: brands.name,
        category: categories.name,
        price: products.price,
        inventoryQuantity: products.inventoryQuantity,
        views: products.viewCount,
        addToCarts: products.addToCartCount,
        checkouts: products.checkoutCount,
        purchases: products.purchaseCount,
        unitsSold: products.unitsSold,
        conversionRate: products.conversionRate,
        popularityScore: products.popularityScore,
      })
      .from(products)
      .leftJoin(brands, eq(products.brandId, brands.id))
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(
        and(
          eq(products.active, true),
          query.productId ? eq(products.id, query.productId) : undefined,
          query.brandId ? eq(products.brandId, query.brandId) : undefined,
          query.categoryId ? eq(products.categoryId, query.categoryId) : undefined,
        ),
      )
      .orderBy(desc(products.popularityScore), desc(products.unitsSold))
      .limit(query.limit);
    return response(query, data, {
      source: 'products',
      definitions: {
        conversionRate: 'Persisted website product conversion rate.',
        popularityScore: 'Persisted ranking signal.',
      },
      caveats: [
        'Product counters are current all-time values, so date filters are intentionally unavailable.',
      ],
    });
  }

  if (query.query === 'category_performance' || query.query === 'brand_performance') {
    const categoryMode = query.query === 'category_performance';
    const id = categoryMode ? products.categoryId : products.brandId;
    const name = categoryMode ? categories.name : brands.name;
    const join = categoryMode ? categories : brands;
    const data = await db
      .select({
        id,
        name,
        products: sql<number>`count(${products.id})::int`,
        views: sql<number>`coalesce(sum(${products.viewCount}), 0)::int`,
        addToCarts: sql<number>`coalesce(sum(${products.addToCartCount}), 0)::int`,
        purchases: sql<number>`coalesce(sum(${products.purchaseCount}), 0)::int`,
        unitsSold: sql<number>`coalesce(sum(${products.unitsSold}), 0)::int`,
        conversionRate: sql<number>`coalesce(sum(${products.purchaseCount})::double precision / nullif(sum(${products.viewCount}), 0), 0)`,
      })
      .from(products)
      .leftJoin(join, eq(id, join.id))
      .where(
        and(
          eq(products.active, true),
          categoryMode && query.categoryId ? eq(products.categoryId, query.categoryId) : undefined,
          !categoryMode && query.brandId ? eq(products.brandId, query.brandId) : undefined,
        ),
      )
      .groupBy(id, name)
      .orderBy(sql`coalesce(sum(${products.purchaseCount}), 0) desc`)
      .limit(query.limit);
    return response(query, data, {
      source: categoryMode ? 'products + categories' : 'products + brands',
      definitions: { conversionRate: 'Summed product purchases ÷ summed product views.' },
      caveats: ['Uses current all-time product counters.'],
    });
  }

  if (query.query === 'inventory_risk') {
    const data = await db
      .select({
        id: products.id,
        title: products.title,
        sku: products.sku,
        inventoryQuantity: products.inventoryQuantity,
        inStock: products.inStock,
        purchasePrice: access.canViewProfit ? products.purchasePrice : sql<null>`null`,
        risk: sql<string>`case when not ${products.inStock} or ${products.inventoryQuantity} <= 0 then 'out_of_stock' when ${products.purchasePrice} is null then 'missing_cost' else 'low_stock' end`,
      })
      .from(products)
      .where(
        and(
          eq(products.active, true),
          query.productId ? eq(products.id, query.productId) : undefined,
          query.brandId ? eq(products.brandId, query.brandId) : undefined,
          query.categoryId ? eq(products.categoryId, query.categoryId) : undefined,
          sql`(not ${products.inStock} or ${products.inventoryQuantity} <= 5 or ${products.purchasePrice} is null)`,
        ),
      )
      .orderBy(asc(products.inventoryQuantity))
      .limit(query.limit);
    return response(query, data, {
      source: 'products',
      definitions: {
        risk: 'Out of stock, missing purchase cost, or inventory quantity at most five.',
      },
    });
  }

  if (query.query === 'promotion_performance') {
    const conditions = [
      ...dateConditions(orders.createdAt, query),
      query.confirmedOnly ? confirmedLifecycleOrderCondition() : undefined,
      sql`${orders.promoCode} is not null`,
    ];
    const data = await db
      .select({
        promoCode: orders.promoCode,
        orders: sql<number>`count(*)::int`,
        confirmedOrders: sql<number>`count(*) filter (where ${confirmedLifecycleOrderCondition()})::int`,
        originalSubtotal: sql<number>`coalesce(sum(${orders.promoOriginalSubtotal}), 0)::double precision`,
        discountAmount: sql<number>`coalesce(sum(${orders.promoDiscountAmount}), 0)::double precision`,
        finalSubtotal: sql<number>`coalesce(sum(${orders.promoFinalSubtotal}), 0)::double precision`,
      })
      .from(orders)
      .where(and(...conditions))
      .groupBy(orders.promoCode)
      .orderBy(sql`count(*) desc`)
      .limit(query.limit);
    return response(query, data, {
      source: 'orders',
      definitions: { discountAmount: 'Sum of discount recorded on orders using the promo code.' },
      caveats: ['This reports order usage, not causal lift versus orders without a promotion.'],
    });
  }

  const data = await db
    .select({
      id: products.id,
      title: products.title,
      sku: products.sku,
      missingTitleAr: sql<boolean>`${products.titleAr} is null or btrim(${products.titleAr}) = ''`,
      missingDescription: sql<boolean>`${products.description} is null or btrim(${products.description}) = ''`,
      missingDescriptionAr: sql<boolean>`${products.descriptionAr} is null or btrim(${products.descriptionAr}) = ''`,
    })
    .from(products)
    .where(
      and(
        eq(products.active, true),
        query.productId ? eq(products.id, query.productId) : undefined,
        query.brandId ? eq(products.brandId, query.brandId) : undefined,
        query.categoryId ? eq(products.categoryId, query.categoryId) : undefined,
        sql`(${products.titleAr} is null or btrim(${products.titleAr}) = '' or ${products.description} is null or btrim(${products.description}) = '' or ${products.descriptionAr} is null or btrim(${products.descriptionAr}) = '')`,
      ),
    )
    .limit(query.limit);
  return response(query, data, {
    source: 'products',
    definitions: {
      missingTitleAr: 'Arabic title is null or blank.',
      missingDescription: 'Primary description is null or blank.',
      missingDescriptionAr: 'Arabic description is null or blank.',
    },
  });
}

export async function executeSemanticAnalyticsComparison(raw: unknown, access: AnalyticsAccess) {
  const comparison = semanticAnalyticsComparisonSchema.parse(raw);
  const [current, previous] = await Promise.all([
    executeSemanticAnalytics(
      {
        query: comparison.query,
        startDate: comparison.currentStartDate,
        endDate: comparison.currentEndDate,
        confirmedOnly: comparison.confirmedOnly,
        limit: comparison.limit,
      },
      access,
    ),
    executeSemanticAnalytics(
      {
        query: comparison.query,
        startDate: comparison.previousStartDate,
        endDate: comparison.previousEndDate,
        confirmedOnly: comparison.confirmedOnly,
        limit: comparison.limit,
      },
      access,
    ),
  ]);
  const currentData = current.data as Record<string, unknown>;
  const previousData = previous.data as Record<string, unknown>;
  const deltas = Object.fromEntries(
    Object.entries(currentData).flatMap(([key, value]) => {
      const previousValue = previousData[key];
      if (typeof value !== 'number' || typeof previousValue !== 'number') return [];
      const change = value - previousValue;
      return [
        [
          key,
          {
            current: value,
            previous: previousValue,
            absolute: change,
            percent: previousValue === 0 ? null : change / Math.abs(previousValue),
          },
        ],
      ];
    }),
  );
  return {
    comparison: true,
    query: comparison.query,
    currentPeriod: {
      startDate: comparison.currentStartDate,
      endDate: comparison.currentEndDate,
      data: current.data,
    },
    previousPeriod: {
      startDate: comparison.previousStartDate,
      endDate: comparison.previousEndDate,
      data: previous.data,
    },
    deltas,
    source: current.source,
    currency: current.currency,
    definition: current.definition,
    metricDefinitions: current.metricDefinitions,
    caveats: current.caveats,
    generatedAt: new Date().toISOString(),
  };
}
