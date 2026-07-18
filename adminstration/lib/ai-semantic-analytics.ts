import { SEMANTIC_ANALYTICS_CATALOG, semanticAnalyticsComparisonSchema, semanticAnalyticsQuerySchema, type SemanticAnalyticsQuery } from '@bric/ai-core';
import { and, asc, desc, eq, sql } from 'drizzle-orm';

import { getDb } from '../db/client';
import {
  analyticsEvents, brands, bundleComponents, bundleListings, categories, orders,
  processedOrders, products,
} from '../db/schema';

type AnalyticsAccess = { canViewProfit: boolean };

function dateConditions(column: typeof orders.createdAt | typeof analyticsEvents.occurredAt, query: SemanticAnalyticsQuery) {
  return [
    query.startDate ? sql`${column}::date >= ${query.startDate}` : undefined,
    query.endDate ? sql`${column}::date <= ${query.endDate}` : undefined,
  ];
}

function response(query: SemanticAnalyticsQuery, data: unknown, input: { source: string; definitions: Record<string, string>; caveats?: string[] }) {
  return {
    query: query.query,
    filters: { startDate: query.startDate ?? null, endDate: query.endDate ?? null, productId: query.productId ?? null, categoryId: query.categoryId ?? null, brandId: query.brandId ?? null, confirmedOnly: query.confirmedOnly },
    source: input.source,
    currency: 'DZD',
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
    const [data] = await db.select({
      products: sql<number>`count(*)::int`, activeProducts: sql<number>`count(*) filter (where ${products.active})::int`,
      inStockProducts: sql<number>`count(*) filter (where ${products.active} and ${products.inStock})::int`,
      outOfStockProducts: sql<number>`count(*) filter (where ${products.active} and not ${products.inStock})::int`,
      inventoryUnits: sql<number>`coalesce(sum(${products.inventoryQuantity}), 0)::int`,
      inventoryRetailValue: sql<number>`coalesce(sum(${products.price} * ${products.inventoryQuantity}), 0)::double precision`,
      inventoryCostValue: access.canViewProfit ? sql<number>`coalesce(sum(${products.purchasePrice} * ${products.inventoryQuantity}), 0)::double precision` : sql<null>`null`,
    }).from(products);
    return response(query, data, { source: 'products', definitions: { inventoryRetailValue: 'Current price × inventory quantity.', inventoryCostValue: access.canViewProfit ? 'Purchase price × inventory quantity.' : 'Restricted for this user.' } });
  }

  if (query.query === 'sales_summary') {
    const statsDate = sql`coalesce(${processedOrders.encaissedAt}, ${processedOrders.deliveredAt}, ${processedOrders.orderCreatedAt})`;
    const conditions = [query.startDate ? sql`${statsDate}::date >= ${query.startDate}` : undefined, query.endDate ? sql`${statsDate}::date <= ${query.endDate}` : undefined];
    const [data] = await db.select({
      orders: sql<number>`count(*)::int`, amountCollected: sql<number>`coalesce(sum(${processedOrders.amountCollected}), 0)::double precision`,
      netRevenue: sql<number>`coalesce(sum(${processedOrders.netRevenue}), 0)::double precision`, totalFees: sql<number>`coalesce(sum(${processedOrders.totalFees}), 0)::double precision`,
      productCost: access.canViewProfit ? sql<number>`coalesce(sum(${processedOrders.productCost}), 0)::double precision` : sql<null>`null`,
      profit: access.canViewProfit ? sql<number>`coalesce(sum(${processedOrders.profit}), 0)::double precision` : sql<null>`null`,
      averageNetRevenue: sql<number>`coalesce(avg(${processedOrders.netRevenue}), 0)::double precision`,
    }).from(processedOrders).where(and(...conditions));
    return response(query, data, { source: 'admin.processed_orders', definitions: { netRevenue: 'Collected amount minus delivery/provider fees.', profit: access.canViewProfit ? 'Net revenue minus imported product cost.' : 'Restricted for this user.' }, caveats: ['Uses imported processed orders, not every newly submitted storefront order.'] });
  }

  if (query.query === 'order_summary') {
    const conditions = [...dateConditions(orders.createdAt, query), query.confirmedOnly ? sql`${orders.confirmed} = 1` : undefined, sql`${orders.archivedAt} is null`];
    const [data] = await db.select({
      orders: sql<number>`count(*)::int`, confirmedOrders: sql<number>`count(*) filter (where ${orders.confirmed} = 1)::int`,
      confirmationRate: sql<number>`coalesce(count(*) filter (where ${orders.confirmed} = 1)::double precision / nullif(count(*), 0), 0)`,
      grossOrderValue: sql<number>`coalesce(sum(${orders.price}), 0)::double precision`, averageOrderValue: sql<number>`coalesce(avg(${orders.price}), 0)::double precision`,
      discountedOrders: sql<number>`count(*) filter (where ${orders.promoDiscountAmount} > 0)::int`, discountAmount: sql<number>`coalesce(sum(${orders.promoDiscountAmount}), 0)::double precision`,
    }).from(orders).where(and(...conditions));
    return response(query, data, { source: 'orders', definitions: { confirmationRate: 'Confirmed active orders ÷ active orders.', grossOrderValue: 'Sum of stored order price.' }, caveats: ['Order value is submitted value; use sales_summary for imported fulfilled-order economics.'] });
  }

  if (query.query === 'funnel_summary') {
    const conditions = dateConditions(analyticsEvents.occurredAt, query);
    const [row] = await db.select({
      sessions: sql<number>`count(distinct ${analyticsEvents.sessionId}) filter (where ${analyticsEvents.eventName} = 'page_view')::int`,
      productViews: sql<number>`count(*) filter (where ${analyticsEvents.eventName} = 'view_item')::int`,
      addToCarts: sql<number>`count(*) filter (where ${analyticsEvents.eventName} = 'add_to_cart')::int`,
      checkoutStarts: sql<number>`count(*) filter (where ${analyticsEvents.eventName} = 'begin_checkout')::int`,
      purchases: sql<number>`count(*) filter (where ${analyticsEvents.eventName} = 'purchase')::int`,
    }).from(analyticsEvents).where(and(...conditions));
    const rate = (numerator: number, denominator: number) => denominator > 0 ? numerator / denominator : 0;
    const data = { ...row, viewToCartRate: rate(row.addToCarts, row.productViews), cartToCheckoutRate: rate(row.checkoutStarts, row.addToCarts), checkoutToPurchaseRate: rate(row.purchases, row.checkoutStarts), sessionPurchaseRate: rate(row.purchases, row.sessions) };
    return response(query, data, { source: 'analytics_events', definitions: { viewToCartRate: 'Add-to-cart events ÷ product-view events.', sessionPurchaseRate: 'Purchase events ÷ sessions with page views.' }, caveats: ['Event counts are not unique users and may include repeated actions.'] });
  }

  if (query.query === 'product_performance') {
    const data = await db.select({ id: products.id, title: products.title, sku: products.sku, brand: brands.name, category: categories.name, price: products.price, inventoryQuantity: products.inventoryQuantity, views: products.viewCount, addToCarts: products.addToCartCount, checkouts: products.checkoutCount, purchases: products.purchaseCount, unitsSold: products.unitsSold, conversionRate: products.conversionRate, popularityScore: products.popularityScore }).from(products).leftJoin(brands, eq(products.brandId, brands.id)).leftJoin(categories, eq(products.categoryId, categories.id)).where(and(eq(products.active, true), query.productId ? eq(products.id, query.productId) : undefined, query.brandId ? eq(products.brandId, query.brandId) : undefined, query.categoryId ? eq(products.categoryId, query.categoryId) : undefined)).orderBy(desc(products.popularityScore), desc(products.unitsSold)).limit(query.limit);
    return response(query, data, { source: 'products', definitions: { conversionRate: 'Persisted website product conversion rate.', popularityScore: 'Persisted ranking signal.' }, caveats: ['Product counters are current all-time values, so date filters are intentionally unavailable.'] });
  }

  if (query.query === 'category_performance' || query.query === 'brand_performance') {
    const categoryMode = query.query === 'category_performance';
    const id = categoryMode ? products.categoryId : products.brandId;
    const name = categoryMode ? categories.name : brands.name;
    const join = categoryMode ? categories : brands;
    const data = await db.select({ id, name, products: sql<number>`count(${products.id})::int`, views: sql<number>`coalesce(sum(${products.viewCount}), 0)::int`, addToCarts: sql<number>`coalesce(sum(${products.addToCartCount}), 0)::int`, purchases: sql<number>`coalesce(sum(${products.purchaseCount}), 0)::int`, unitsSold: sql<number>`coalesce(sum(${products.unitsSold}), 0)::int`, conversionRate: sql<number>`coalesce(sum(${products.purchaseCount})::double precision / nullif(sum(${products.viewCount}), 0), 0)` }).from(products).leftJoin(join, eq(id, join.id)).where(and(eq(products.active, true), categoryMode && query.categoryId ? eq(products.categoryId, query.categoryId) : undefined, !categoryMode && query.brandId ? eq(products.brandId, query.brandId) : undefined)).groupBy(id, name).orderBy(sql`coalesce(sum(${products.purchaseCount}), 0) desc`).limit(query.limit);
    return response(query, data, { source: categoryMode ? 'products + categories' : 'products + brands', definitions: { conversionRate: 'Summed product purchases ÷ summed product views.' }, caveats: ['Uses current all-time product counters.'] });
  }

  if (query.query === 'inventory_risk') {
    const data = await db.select({ id: products.id, title: products.title, sku: products.sku, inventoryQuantity: products.inventoryQuantity, inStock: products.inStock, purchasePrice: access.canViewProfit ? products.purchasePrice : sql<null>`null`, risk: sql<string>`case when not ${products.inStock} or ${products.inventoryQuantity} <= 0 then 'out_of_stock' when ${products.purchasePrice} is null then 'missing_cost' else 'low_stock' end` }).from(products).where(and(eq(products.active, true), query.productId ? eq(products.id, query.productId) : undefined, query.brandId ? eq(products.brandId, query.brandId) : undefined, query.categoryId ? eq(products.categoryId, query.categoryId) : undefined, sql`(not ${products.inStock} or ${products.inventoryQuantity} <= 5 or ${products.purchasePrice} is null)`)).orderBy(asc(products.inventoryQuantity)).limit(query.limit);
    return response(query, data, { source: 'products', definitions: { risk: 'Out of stock, missing purchase cost, or inventory quantity at most five.' } });
  }

  if (query.query === 'promotion_performance') {
    const conditions = [...dateConditions(orders.createdAt, query), query.confirmedOnly ? sql`${orders.confirmed} = 1` : undefined, sql`${orders.archivedAt} is null`, sql`${orders.promoCode} is not null`];
    const data = await db.select({ promoCode: orders.promoCode, orders: sql<number>`count(*)::int`, confirmedOrders: sql<number>`count(*) filter (where ${orders.confirmed} = 1)::int`, originalSubtotal: sql<number>`coalesce(sum(${orders.promoOriginalSubtotal}), 0)::double precision`, discountAmount: sql<number>`coalesce(sum(${orders.promoDiscountAmount}), 0)::double precision`, finalSubtotal: sql<number>`coalesce(sum(${orders.promoFinalSubtotal}), 0)::double precision` }).from(orders).where(and(...conditions)).groupBy(orders.promoCode).orderBy(sql`count(*) desc`).limit(query.limit);
    return response(query, data, { source: 'orders', definitions: { discountAmount: 'Sum of discount recorded on orders using the promo code.' }, caveats: ['This reports order usage, not causal lift versus orders without a promotion.'] });
  }

  if (query.query === 'bundle_performance') {
    const data = await db.select({ id: bundleListings.id, productId: products.id, title: products.title, active: bundleListings.active, price: products.price, purchaseCost: access.canViewProfit ? products.purchasePrice : sql<null>`null`, componentCount: sql<number>`count(${bundleComponents.id})::int`, unitsSold: products.unitsSold, views: products.viewCount, purchases: products.purchaseCount, conversionRate: products.conversionRate }).from(bundleListings).innerJoin(products, eq(bundleListings.productId, products.id)).leftJoin(bundleComponents, eq(bundleComponents.bundleId, bundleListings.id)).where(query.productId ? eq(products.id, query.productId) : undefined).groupBy(bundleListings.id, products.id).orderBy(desc(products.unitsSold), desc(products.popularityScore)).limit(query.limit);
    return response(query, data, { source: 'bundle_listings + bundle_components + products', definitions: { componentCount: 'Number of distinct component product rows in the bundle.' }, caveats: ['Performance is based on the bundle product listing counters.'] });
  }

  const data = await db.select({ id: products.id, title: products.title, sku: products.sku, missingTitleAr: sql<boolean>`${products.titleAr} is null or btrim(${products.titleAr}) = ''`, missingDescription: sql<boolean>`${products.description} is null or btrim(${products.description}) = ''`, missingDescriptionAr: sql<boolean>`${products.descriptionAr} is null or btrim(${products.descriptionAr}) = ''` }).from(products).where(and(eq(products.active, true), query.productId ? eq(products.id, query.productId) : undefined, query.brandId ? eq(products.brandId, query.brandId) : undefined, query.categoryId ? eq(products.categoryId, query.categoryId) : undefined, sql`(${products.titleAr} is null or btrim(${products.titleAr}) = '' or ${products.description} is null or btrim(${products.description}) = '' or ${products.descriptionAr} is null or btrim(${products.descriptionAr}) = '')`)).limit(query.limit);
  return response(query, data, { source: 'products', definitions: { missingTitleAr: 'Arabic title is null or blank.', missingDescription: 'Primary description is null or blank.', missingDescriptionAr: 'Arabic description is null or blank.' } });
}

export async function executeSemanticAnalyticsComparison(raw: unknown, access: AnalyticsAccess) {
  const comparison = semanticAnalyticsComparisonSchema.parse(raw);
  const [current, previous] = await Promise.all([
    executeSemanticAnalytics({ query: comparison.query, startDate: comparison.currentStartDate, endDate: comparison.currentEndDate, confirmedOnly: comparison.confirmedOnly, limit: comparison.limit }, access),
    executeSemanticAnalytics({ query: comparison.query, startDate: comparison.previousStartDate, endDate: comparison.previousEndDate, confirmedOnly: comparison.confirmedOnly, limit: comparison.limit }, access),
  ]);
  const currentData = current.data as Record<string, unknown>;
  const previousData = previous.data as Record<string, unknown>;
  const deltas = Object.fromEntries(Object.entries(currentData).flatMap(([key, value]) => {
    const previousValue = previousData[key];
    if (typeof value !== 'number' || typeof previousValue !== 'number') return [];
    const change = value - previousValue;
    return [[key, { current: value, previous: previousValue, absolute: change, percent: previousValue === 0 ? null : change / Math.abs(previousValue) }]];
  }));
  return {
    comparison: true,
    query: comparison.query,
    currentPeriod: { startDate: comparison.currentStartDate, endDate: comparison.currentEndDate, data: current.data },
    previousPeriod: { startDate: comparison.previousStartDate, endDate: comparison.previousEndDate, data: previous.data },
    deltas,
    source: current.source,
    currency: current.currency,
    definition: current.definition,
    metricDefinitions: current.metricDefinitions,
    caveats: current.caveats,
    generatedAt: new Date().toISOString(),
  };
}
