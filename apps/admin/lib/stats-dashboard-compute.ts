import { eq, inArray, or, sql } from 'drizzle-orm';

import { getReportingDb } from './reporting-db';
import {
  adCosts,
  orders,
  processedOrderProducts,
  processedOrders,
  products,
} from '@bric/db/schema';
import { emptyMetaCommerceReport } from './meta-commerce-analytics';
import { coerceOrderStatus, isConfirmedLifecycleStatus } from './orders';
import {
  buildCartProductLookup,
  collectCartProductReferenceBuckets,
  getCartProductLookupKey,
} from './order-product-references';
import { buildAdCostWhere } from './stats-ad-costs';
import { type ProductPerformance, type StatsFilters, statsQuerySchema } from './stats-contract';
import { emptyDashboard, optionalAnalyticsDiagnostic } from './stats-dashboard-foundation';
import { getLiveOrderSummary } from './stats-dashboard-live';
import { getExperienceStats } from './stats-experience';
import {
  buildAnalyticsRollupWhere,
  buildAnalyticsWhere,
  buildResolvedFilters,
  buildStatsWhere,
  getMetaAdsTrackingData,
  getWebsiteAnalyticsData,
  mergeCanonicalWebsitePurchases,
  statsDateExpression,
  toIsoDateString,
  type WebsiteMetricRow,
} from './stats-live-sources';
import { listImportHistory } from './stats-order-import';
import { numberOrZero, round } from './stats-values';

export async function computeStatsDashboard(input: StatsFilters) {
  const db = getReportingDb();
  const filters = buildResolvedFilters(statsQuerySchema.parse(input));
  const where = buildStatsWhere(filters);
  const adWhere = buildAdCostWhere(filters);
  const analyticsWhere = buildAnalyticsWhere(filters);
  const analyticsRollupWhere = buildAnalyticsRollupWhere(filters);
  const websiteAnalyticsPromise = getWebsiteAnalyticsData(
    db,
    analyticsWhere,
    analyticsRollupWhere,
    filters,
  );
  const metaAdsTrackingPromise = optionalAnalyticsDiagnostic(getMetaAdsTrackingData(db, filters));
  const experienceStatsPromise = getExperienceStats(db, filters);

  const [
    summaryRows,
    liveOrderSummary,
    dailyTrendRows,
    monthlyTrendRows,
    weeklyTrendRows,
    importTrendRows,
    wilayaRows,
    deliveryRows,
    productRows,
    importHistory,
    adSpendRows,
    allOrdersRows,
  ] = await Promise.all([
    db
      .select({
        totalOrders: sql<number>`count(*)::int`,
        totalAmountCollected: sql<number>`coalesce(sum(${processedOrders.amountCollected})::double precision, 0)`,
        totalFees: sql<number>`coalesce(sum(${processedOrders.totalFees})::double precision, 0)`,
        totalNetRevenue: sql<number>`coalesce(sum(${processedOrders.netRevenue})::double precision, 0)`,
        totalProductCost: sql<number>`coalesce(sum(${processedOrders.productCost})::double precision, 0)`,
        totalGrossProfit: sql<number>`coalesce(sum(${processedOrders.profit})::double precision, 0)`,
        feeLivraison: sql<number>`coalesce(sum(${processedOrders.feeLivraison})::double precision, 0)`,
        feePoids: sql<number>`coalesce(sum(${processedOrders.feePoids})::double precision, 0)`,
        feeExtra: sql<number>`coalesce(sum(${processedOrders.feeExtra})::double precision, 0)`,
        feeSms: sql<number>`coalesce(sum(${processedOrders.feeSms})::double precision, 0)`,
        feeStockage: sql<number>`coalesce(sum(${processedOrders.feeStockage})::double precision, 0)`,
        feeCommission: sql<number>`coalesce(sum(${processedOrders.feeCommission})::double precision, 0)`,
        profitableOrders: sql<number>`count(*) filter (where ${processedOrders.profit} > 0)::int`,
        unprofitableOrders: sql<number>`count(*) filter (where ${processedOrders.profit} < 0)::int`,
        breakEvenOrders: sql<number>`count(*) filter (where ${processedOrders.profit} = 0)::int`,
      })
      .from(processedOrders)
      .where(where),
    getLiveOrderSummary(db, filters),
    db
      .select({
        bucket: sql<string>`to_char(date_trunc('day', ${statsDateExpression}), 'YYYY-MM-DD')`,
        orders: sql<number>`count(*)::int`,
        revenue: sql<number>`coalesce(sum(${processedOrders.netRevenue})::double precision, 0)`,
        profit: sql<number>`coalesce(sum(${processedOrders.profit})::double precision, 0)`,
        fees: sql<number>`coalesce(sum(${processedOrders.totalFees})::double precision, 0)`,
      })
      .from(processedOrders)
      .where(where)
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db
      .select({
        bucket: sql<string>`to_char(date_trunc('month', ${statsDateExpression}), 'YYYY-MM')`,
        orders: sql<number>`count(*)::int`,
        revenue: sql<number>`coalesce(sum(${processedOrders.netRevenue})::double precision, 0)`,
        profit: sql<number>`coalesce(sum(${processedOrders.profit})::double precision, 0)`,
        fees: sql<number>`coalesce(sum(${processedOrders.totalFees})::double precision, 0)`,
      })
      .from(processedOrders)
      .where(where)
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db
      .select({
        bucket: sql<string>`to_char(date_trunc('week', ${statsDateExpression}), 'YYYY-MM-DD')`,
        orders: sql<number>`count(*)::int`,
        revenue: sql<number>`coalesce(sum(${processedOrders.netRevenue})::double precision, 0)`,
        profit: sql<number>`coalesce(sum(${processedOrders.profit})::double precision, 0)`,
        fees: sql<number>`coalesce(sum(${processedOrders.totalFees})::double precision, 0)`,
      })
      .from(processedOrders)
      .where(where)
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db
      .select({
        bucket: sql<string>`to_char(date_trunc('day', ${processedOrders.importedAt}), 'YYYY-MM-DD')`,
        orders: sql<number>`count(*)::int`,
        revenue: sql<number>`coalesce(sum(${processedOrders.netRevenue})::double precision, 0)`,
        profit: sql<number>`coalesce(sum(${processedOrders.profit})::double precision, 0)`,
        fees: sql<number>`coalesce(sum(${processedOrders.totalFees})::double precision, 0)`,
      })
      .from(processedOrders)
      .where(where)
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db
      .select({
        name: sql<string>`coalesce(nullif(${processedOrders.wilaya}, ''), 'Unknown')`,
        orders: sql<number>`count(*)::int`,
        collected: sql<number>`coalesce(sum(${processedOrders.amountCollected})::double precision, 0)`,
        revenue: sql<number>`coalesce(sum(${processedOrders.netRevenue})::double precision, 0)`,
        profit: sql<number>`coalesce(sum(${processedOrders.profit})::double precision, 0)`,
        fees: sql<number>`coalesce(sum(${processedOrders.totalFees})::double precision, 0)`,
      })
      .from(processedOrders)
      .where(where)
      .groupBy(sql`1`)
      .orderBy(sql`3 desc`)
      .limit(8),
    db
      .select({
        name: sql<string>`coalesce(nullif(${processedOrders.deliveryType}, ''), 'Unknown')`,
        orders: sql<number>`count(*)::int`,
        collected: sql<number>`coalesce(sum(${processedOrders.amountCollected})::double precision, 0)`,
        revenue: sql<number>`coalesce(sum(${processedOrders.amountCollected})::double precision, 0)`,
        fees: sql<number>`coalesce(sum(${processedOrders.totalFees})::double precision, 0)`,
        netRevenue: sql<number>`coalesce(sum(${processedOrders.netRevenue})::double precision, 0)`,
        profit: sql<number>`coalesce(sum(${processedOrders.profit})::double precision, 0)`,
      })
      .from(processedOrders)
      .where(where)
      .groupBy(sql`1`)
      .orderBy(sql`2 desc`),
    db
      .select({
        productId: processedOrderProducts.productId,
        title: processedOrderProducts.title,
        sku: processedOrderProducts.sku,
        price: sql<number>`coalesce(${processedOrderProducts.price}, 0)::double precision`,
        cost: sql<number>`coalesce(${processedOrderProducts.cost}, 0)::double precision`,
        categoryName: processedOrderProducts.categoryName,
        brandName: processedOrderProducts.brandName,
        categoryId: processedOrderProducts.categoryId,
        brandId: processedOrderProducts.brandId,
      })
      .from(processedOrders)
      .innerJoin(
        processedOrderProducts,
        eq(processedOrders.id, processedOrderProducts.processedOrderId),
      )
      .where(where),
    listImportHistory(undefined, db),
    db
      .select({
        spend: sql<number>`coalesce(sum(${adCosts.spend})::double precision, 0)`,
        impressions: sql<number>`coalesce(sum(${adCosts.impressions})::int, 0)`,
        clicks: sql<number>`coalesce(sum(${adCosts.clicks})::int, 0)`,
        conversions: sql<number>`coalesce(sum(${adCosts.conversions})::int, 0)`,
      })
      .from(adCosts)
      .where(adWhere),
    db.select({ cartProducts: orders.cartProducts, confirmed: orders.inHouseStatus }).from(orders),
  ]);
  const { websiteSummaryRows, websiteSearchRows, websiteTopProductRows, websiteMetricRows } =
    await websiteAnalyticsPromise;
  const metaTrackingResult = await metaAdsTrackingPromise;
  const metaEventRows = metaTrackingResult.data?.eventRows ?? [];
  const metaPayloadRows = metaTrackingResult.data?.payloadRows ?? [];
  const metaHealth = metaTrackingResult.data?.health;
  const experience = await experienceStatsPromise;

  const summaryRow = summaryRows[0];
  const adSummary = adSpendRows[0];
  const websiteSummary = websiteSummaryRows[0];
  const adSpend = round(numberOrZero(adSummary?.spend));
  const totalOrders = liveOrderSummary.totalOrders;
  const totalConfirmedOrders = liveOrderSummary.successfulOrders;
  const websiteProductMetricsById = new Map<string, Omit<WebsiteMetricRow, 'id'>>(
    websiteMetricRows.map((row: WebsiteMetricRow) => [
      String(row.id),
      {
        viewCount: row.viewCount,
        addToCartCount: row.addToCartCount,
        checkoutCount: row.checkoutCount,
        websitePurchaseCount: row.websitePurchaseCount,
        popularityScore: round(numberOrZero(row.popularityScore)),
        websiteConversionRate: round(numberOrZero(row.websiteConversionRate) * 100),
      },
    ]),
  );
  const website = mergeCanonicalWebsitePurchases(
    {
      sessions: websiteSummary?.sessions ?? 0,
      journeys: websiteSummary?.journeys ?? 0,
      pageViews: websiteSummary?.pageViews ?? 0,
      productViews: websiteSummary?.productViews ?? 0,
      addToCarts: websiteSummary?.addToCarts ?? 0,
      checkoutStarts: websiteSummary?.checkoutStarts ?? 0,
      purchases: 0,
      searches: websiteSummary?.searches ?? 0,
      zeroResultSearches: websiteSummary?.zeroResultSearches ?? 0,
      sessionConversionRate: 0,
      viewToCartRate: websiteSummary?.productViews
        ? round(((websiteSummary?.addToCarts ?? 0) / websiteSummary.productViews) * 100)
        : 0,
      cartToPurchaseRate: 0,
      checkoutToPurchaseRate: 0,
      topSearches: websiteSearchRows.map((row) => ({
        term: row.term,
        searches: row.searches,
        zeroResults: row.zeroResults,
      })),
      funnel: [
        { name: 'Sessions', value: websiteSummary?.sessions ?? 0 },
        { name: 'Product views', value: websiteSummary?.productViews ?? 0 },
        { name: 'Adds to cart', value: websiteSummary?.addToCarts ?? 0 },
        { name: 'Checkout starts', value: websiteSummary?.checkoutStarts ?? 0 },
      ].filter((item) => item.value > 0),
      topProducts: websiteTopProductRows.map((row) => ({
        id: String(row.id),
        title: row.title,
        unitsSold: 0,
        revenue: 0,
        cost: 0,
        profit: 0,
        margin: 0,
        sku: row.sku,
        categoryName: row.categoryName,
        brandName: row.brandName,
        viewCount: row.viewCount,
        addToCartCount: row.addToCartCount,
        checkoutCount: row.checkoutCount,
        websitePurchaseCount: row.websitePurchaseCount,
        popularityScore: round(numberOrZero(row.popularityScore)),
        websiteConversionRate: round(numberOrZero(row.websiteConversionRate) * 100),
      })),
      ...experience.website,
    },
    totalOrders,
  );
  const metaAds = {
    trackingAvailable: metaTrackingResult.available,
    events: metaEventRows.map((row) => ({
      name: row.name,
      total: row.total,
      pixelFired: row.pixelFired,
      capiSent: row.capiSent,
      capiDelivered: row.capiDelivered,
      capiFailed: row.capiFailed,
      lastOccurredAt: toIsoDateString(row.lastOccurredAt),
    })),
    recentPayloads: metaPayloadRows.map((row) => ({
      eventId: row.eventId,
      analyticsEventName: row.analyticsEventName,
      metaEventName: row.metaEventName,
      pagePath: row.pagePath,
      occurredAt: toIsoDateString(row.occurredAt) ?? new Date(0).toISOString(),
      pixelPayload: row.pixelPayload,
      capiPayload: row.capiPayload,
      capiStatus: row.capiStatus,
      capiOk: row.capiOk,
    })),
    health: metaHealth,
    paidAttribution: experience.metaPaidAttribution,
    commerce: emptyMetaCommerceReport(),
  };

  if (!summaryRow || summaryRow.totalOrders === 0) {
    const data = emptyDashboard(filters);
    data.summary.totalOrders = totalOrders;
    data.summary.totalConfirmedOrders = totalConfirmedOrders;
    data.importHistory = importHistory;
    data.latestUnmatchedReferences = importHistory[0]?.unmatchedReferences.slice(0, 8) ?? [];
    data.latestUnmatchedDetails = (importHistory[0]?.unmatchedDetails ?? [])
      .slice(0, 8)
      .map((item) => ({
        ...item,
        batchId: importHistory[0]!.batchId,
      }));
    data.website = website;
    data.metaAds = metaAds;
    data.landingPages = experience.landingPages;
    data.aiAssistants = experience.aiAssistants;
    data.customers = experience.customers;
    return data;
  }

  const productMap = new Map<string, ProductPerformance>();
  const categoryMap = new Map<string, ProductPerformance>();
  const brandMap = new Map<string, ProductPerformance>();
  const orderCountsByProduct = new Map<string, { total: number; confirmed: number }>();
  const cartProductReferences = collectCartProductReferenceBuckets(allOrdersRows);
  const orderLookupRows =
    cartProductReferences.productIds.length === 0 &&
    cartProductReferences.mongoIds.length === 0 &&
    cartProductReferences.slugs.length === 0
      ? []
      : await db
          .select({
            id: products.id,
            mongoId: products.mongoId,
            slug: products.slug,
          })
          .from(products)
          .where(
            or(
              ...(cartProductReferences.productIds.length > 0
                ? [inArray(products.id, cartProductReferences.productIds)]
                : []),
              ...(cartProductReferences.mongoIds.length > 0
                ? [inArray(products.mongoId, cartProductReferences.mongoIds)]
                : []),
              ...(cartProductReferences.slugs.length > 0
                ? [inArray(products.slug, cartProductReferences.slugs)]
                : []),
            ),
          );
  const orderProductLookup = buildCartProductLookup(orderLookupRows);

  for (const order of allOrdersRows) {
    const uniqueProducts = [
      ...new Set(
        (order.cartProducts ?? [])
          .map((value) => getCartProductLookupKey(value))
          .filter((value): value is string => Boolean(value))
          .map((lookupKey) => orderProductLookup.get(lookupKey))
          .filter((value): value is NonNullable<typeof value> => Boolean(value))
          .map((product) => String(product.id)),
      ),
    ];
    for (const productId of uniqueProducts) {
      const entry = orderCountsByProduct.get(productId) ?? { total: 0, confirmed: 0 };
      entry.total += 1;
      if (isConfirmedLifecycleStatus(coerceOrderStatus(order.confirmed))) {
        entry.confirmed += 1;
      }
      orderCountsByProduct.set(productId, entry);
    }
  }

  for (const row of productRows) {
    const productId = row.productId ?? row.title ?? 'unknown-product';
    const productKey = String(productId);
    const categoryKey = row.categoryId ?? row.categoryName ?? 'uncategorized';
    const brandKey = row.brandId ?? row.brandName ?? 'unbranded';
    const itemProfit = numberOrZero(row.price) - numberOrZero(row.cost);

    const currentProduct = productMap.get(productKey) ?? {
      id: productKey,
      title: row.title ?? 'Untitled product',
      unitsSold: 0,
      revenue: 0,
      cost: 0,
      profit: 0,
      margin: 0,
      sku: row.sku,
      categoryName: row.categoryName,
      brandName: row.brandName,
    };

    currentProduct.unitsSold += 1;
    currentProduct.revenue += numberOrZero(row.price);
    currentProduct.cost += numberOrZero(row.cost);
    currentProduct.profit += itemProfit;
    productMap.set(productKey, currentProduct);

    const currentCategory = categoryMap.get(String(categoryKey)) ?? {
      id: String(categoryKey),
      title: row.categoryName ?? 'Uncategorized',
      unitsSold: 0,
      revenue: 0,
      cost: 0,
      profit: 0,
      margin: 0,
      sku: null,
      categoryName: row.categoryName,
      brandName: null,
    };

    currentCategory.unitsSold += 1;
    currentCategory.revenue += numberOrZero(row.price);
    currentCategory.cost += numberOrZero(row.cost);
    currentCategory.profit += itemProfit;
    categoryMap.set(String(categoryKey), currentCategory);

    const currentBrand = brandMap.get(String(brandKey)) ?? {
      id: String(brandKey),
      title: row.brandName ?? 'Unbranded',
      unitsSold: 0,
      revenue: 0,
      cost: 0,
      profit: 0,
      margin: 0,
      sku: null,
      categoryName: null,
      brandName: row.brandName,
    };

    currentBrand.unitsSold += 1;
    currentBrand.revenue += numberOrZero(row.price);
    currentBrand.cost += numberOrZero(row.cost);
    currentBrand.profit += itemProfit;
    brandMap.set(String(brandKey), currentBrand);
  }

  const enrichPerformance = (items: ProductPerformance[]) =>
    items
      .map((item) => ({
        ...item,
        revenue: round(item.revenue),
        cost: round(item.cost),
        profit: round(item.profit),
        margin: item.revenue > 0 ? round((item.profit / item.revenue) * 100) : 0,
        totalOrderCount: item.totalOrderCount,
        confirmedOrderCount: item.confirmedOrderCount,
        confirmationRate:
          item.totalOrderCount && item.totalOrderCount > 10
            ? round(((item.confirmedOrderCount ?? 0) / item.totalOrderCount) * 100)
            : null,
      }))
      .sort((left, right) => right.profit - left.profit)
      .slice(0, 8);

  const allProducts = Array.from(productMap.values())
    .map((item) => {
      const counts = orderCountsByProduct.get(item.id);
      const websiteMetrics = websiteProductMetricsById.get(item.id);
      return {
        ...item,
        revenue: round(item.revenue),
        cost: round(item.cost),
        profit: round(item.profit),
        margin: item.revenue > 0 ? round((item.profit / item.revenue) * 100) : 0,
        totalOrderCount: counts?.total ?? 0,
        confirmedOrderCount: counts?.confirmed ?? 0,
        confirmationRate:
          counts && counts.total > 10 ? round((counts.confirmed / counts.total) * 100) : null,
        viewCount: websiteMetrics?.viewCount ?? 0,
        addToCartCount: websiteMetrics?.addToCartCount ?? 0,
        checkoutCount: websiteMetrics?.checkoutCount ?? 0,
        websitePurchaseCount: websiteMetrics?.websitePurchaseCount ?? 0,
        popularityScore: websiteMetrics?.popularityScore ?? 0,
        websiteConversionRate: websiteMetrics?.websiteConversionRate ?? 0,
      };
    })
    .sort((left, right) => right.unitsSold - left.unitsSold);

  const totalGrossProfit = round(numberOrZero(summaryRow.totalGrossProfit));
  const totalNetRevenue = round(numberOrZero(summaryRow.totalNetRevenue));
  const matchedOrders = summaryRow.totalOrders;
  const netProfitAfterAds = round(totalGrossProfit - adSpend);

  return {
    filters,
    summary: {
      totalOrders,
      totalAmountCollected: round(numberOrZero(summaryRow.totalAmountCollected)),
      totalFees: round(numberOrZero(summaryRow.totalFees)),
      totalNetRevenue,
      totalProductCost: round(numberOrZero(summaryRow.totalProductCost)),
      totalGrossProfit,
      adSpend,
      netProfitAfterAds,
      averageOrderValue:
        matchedOrders > 0
          ? round(numberOrZero(summaryRow.totalAmountCollected) / matchedOrders)
          : 0,
      averageProfitPerOrder: matchedOrders > 0 ? round(totalGrossProfit / matchedOrders) : 0,
      profitMargin: totalNetRevenue > 0 ? round((totalGrossProfit / totalNetRevenue) * 100) : 0,
      profitMarginAfterAds:
        totalNetRevenue > 0 ? round((netProfitAfterAds / totalNetRevenue) * 100) : 0,
      fulfillmentRate:
        totalConfirmedOrders > 0 ? round((matchedOrders / totalConfirmedOrders) * 100) : 0,
      matchedOrders,
      totalConfirmedOrders,
      profitableOrders: summaryRow.profitableOrders,
      unprofitableOrders: summaryRow.unprofitableOrders,
      breakEvenOrders: summaryRow.breakEvenOrders,
    },
    trends: {
      daily: dailyTrendRows.map((row) => ({
        bucket: row.bucket,
        orders: row.orders,
        revenue: round(numberOrZero(row.revenue)),
        profit: round(numberOrZero(row.profit)),
        fees: round(numberOrZero(row.fees)),
      })),
      weekly: weeklyTrendRows.map((row) => ({
        bucket: row.bucket,
        orders: row.orders,
        revenue: round(numberOrZero(row.revenue)),
        profit: round(numberOrZero(row.profit)),
        fees: round(numberOrZero(row.fees)),
      })),
      monthly: monthlyTrendRows.map((row) => ({
        bucket: row.bucket,
        orders: row.orders,
        revenue: round(numberOrZero(row.revenue)),
        profit: round(numberOrZero(row.profit)),
        fees: round(numberOrZero(row.fees)),
      })),
      imports: importTrendRows.map((row) => ({
        bucket: row.bucket,
        orders: row.orders,
        revenue: round(numberOrZero(row.revenue)),
        profit: round(numberOrZero(row.profit)),
        fees: round(numberOrZero(row.fees)),
      })),
    },
    feeBreakdown: {
      livraison: round(numberOrZero(summaryRow.feeLivraison)),
      poids: round(numberOrZero(summaryRow.feePoids)),
      extra: round(numberOrZero(summaryRow.feeExtra)),
      sms: round(numberOrZero(summaryRow.feeSms)),
      stockage: round(numberOrZero(summaryRow.feeStockage)),
      commission: round(numberOrZero(summaryRow.feeCommission)),
      total: round(numberOrZero(summaryRow.totalFees)),
      avgPerOrder:
        matchedOrders > 0 ? round(numberOrZero(summaryRow.totalFees) / matchedOrders) : 0,
    },
    adCosts: {
      totalSpend: adSpend,
      roas: adSpend > 0 ? round(totalNetRevenue / adSpend) : 0,
      cpa: totalOrders > 0 ? round(adSpend / totalOrders) : 0,
      cpc:
        numberOrZero(adSummary?.clicks) > 0 ? round(adSpend / numberOrZero(adSummary?.clicks)) : 0,
      ctr:
        numberOrZero(adSummary?.impressions) > 0
          ? round((numberOrZero(adSummary?.clicks) / numberOrZero(adSummary?.impressions)) * 100)
          : 0,
      conversionRate:
        numberOrZero(adSummary?.clicks) > 0
          ? round((numberOrZero(adSummary?.conversions) / numberOrZero(adSummary?.clicks)) * 100)
          : 0,
    },
    metaAds,
    wilayas: wilayaRows.map((row) => ({
      name: row.name,
      orders: row.orders,
      revenue: round(numberOrZero(row.revenue)),
      profit: round(numberOrZero(row.profit)),
    })),
    wilayaDetails: wilayaRows
      .map((row) => ({
        name: row.name,
        orders: row.orders,
        collected: round(numberOrZero(row.collected)),
        fees: round(numberOrZero(row.fees)),
        revenue: round(numberOrZero(row.revenue)),
        profit: round(numberOrZero(row.profit)),
        avgOrder: row.orders > 0 ? round(numberOrZero(row.revenue) / row.orders) : 0,
      }))
      .sort((left, right) => right.orders - left.orders),
    deliveries: deliveryRows.map((row) => ({
      name: row.name,
      orders: row.orders,
      revenue: round(numberOrZero(row.revenue)),
      collected: round(numberOrZero(row.collected)),
      profit: round(numberOrZero(row.profit)),
      fees: round(numberOrZero(row.fees)),
      netRevenue: round(numberOrZero(row.netRevenue)),
    })),
    topProducts: enrichPerformance(
      Array.from(productMap.values()).map((item) => {
        const counts = orderCountsByProduct.get(item.id);
        return {
          ...item,
          totalOrderCount: counts?.total ?? 0,
          confirmedOrderCount: counts?.confirmed ?? 0,
        };
      }),
    ),
    allProducts,
    topCategories: enrichPerformance(Array.from(categoryMap.values())),
    topBrands: enrichPerformance(Array.from(brandMap.values())),
    profitability: [
      { name: 'Profitable', value: summaryRow.profitableOrders, fill: 'var(--chart-2)' },
      { name: 'Break-even', value: summaryRow.breakEvenOrders, fill: 'var(--chart-4)' },
      { name: 'Loss-making', value: summaryRow.unprofitableOrders, fill: 'var(--chart-5)' },
    ].filter((item) => item.value > 0),
    importHistory,
    latestUnmatchedReferences: importHistory[0]?.unmatchedReferences.slice(0, 8) ?? [],
    latestUnmatchedDetails: (importHistory[0]?.unmatchedDetails ?? []).slice(0, 8).map((item) => ({
      ...item,
      batchId: importHistory[0]!.batchId,
    })),
    website,
    landingPages: experience.landingPages,
    aiAssistants: experience.aiAssistants,
    customers: experience.customers,
  };
}
