import { sql } from 'drizzle-orm';
import { correctedEcotrackStatusSql } from '../ecotrack-status-policy';
import { ecotrackOrderStates, orderLineItems, orders, orderStatusHistory } from '@bric/db/schema';
import { ORDER_STATUS } from '@bric/storefront-core/order-domain';
import {
  getLiveWebsiteProductMetrics,
  type LiveWebsiteProductMetric,
} from '../stats-live-commerce';
import {
  loadBasketPairs,
  loadCustomerEconomics,
  loadMetaRegions,
  loadOperationalCommunes,
  loadOperationalGeography,
  loadOperationalProducts,
  loadProductMetaAssociations,
  type OperationalGeographyRow,
  type OperationalProductRow,
  type ProductMetaAssociation,
} from './commerce-data';
import { cohortCompletionCovers, loadCohortCompletionPair } from './cohort-completion';
import type { AnalyticsFilters } from './contract';
import {
  commonCoverageStart,
  commonCutoff,
  type AnalyticsCanonicalCutoffs,
} from './data-boundaries';
import { clipAnalyticsFilters } from './date-range';
import { loadEconomicsPair, previousFiltersWithCoverage, sourceWarnings } from './economics-data';
import {
  type Database,
  effectiveRange,
  metric,
  metricWithProjectedComparison,
  statsInput,
} from './loaders-shared';
import { metricChange } from './metrics';
import { datePredicate, numeric } from './query-values';
import { loadSourceHealth } from './source-health';

async function loadCatalogOperationalSummary(db: Database, filters: AnalyticsFilters) {
  const result = await db.execute(sql`
    with first_posted as (
      select distinct on (${orderStatusHistory.orderId})
        ${orderStatusHistory.orderId} as order_id,
        (${orderStatusHistory.changedAt} at time zone 'Africa/Algiers')::date as posted_day
      from ${orderStatusHistory}
      where ${orderStatusHistory.status} = ${ORDER_STATUS.POSTED}
      order by ${orderStatusHistory.orderId}, ${orderStatusHistory.changedAt} asc
    )
    select coalesce(sum(${orderLineItems.quantity}), 0)::int as posted_units,
      coalesce(sum(${orderLineItems.quantity}) filter (
        where ${correctedEcotrackStatusSql({ localStatus: orders.inHouseStatus, providerStatus: ecotrackOrderStates.currentStatus })} in ('paye_et_archive', 'payed')
      ), 0)::int as paid_units
    from first_posted
    inner join ${orders} on ${orders.id} = first_posted.order_id
    inner join ${orderLineItems} on ${orderLineItems.orderId} = first_posted.order_id
    left join ${ecotrackOrderStates}
      on ${ecotrackOrderStates.orderId} = first_posted.order_id
      and ${ecotrackOrderStates.deletedAt} is null
    where ${datePredicate(sql`first_posted.posted_day`, filters.startDate, filters.endDate)}
  `);
  const row = (result.rows[0] ?? {}) as Record<string, unknown>;
  return { postedUnits: numeric(row.posted_units), paidUnits: numeric(row.paid_units) };
}

export async function loadCatalogView(
  db: Database,
  filters: AnalyticsFilters,
  cutoffs: AnalyticsCanonicalCutoffs,
) {
  const catalogFilters = clipAnalyticsFilters(
    filters,
    commonCutoff(cutoffs.posted, cutoffs.ecotrack),
    commonCoverageStart(cutoffs.postedFrom, cutoffs.ecotrackFrom),
  );
  const storefrontFilters = clipAnalyticsFilters(
    filters,
    commonCutoff(cutoffs.orders, cutoffs.storefront),
    commonCoverageStart(cutoffs.ordersFrom, cutoffs.storefrontFrom),
  );
  const previousAnalytics = previousFiltersWithCoverage(
    catalogFilters,
    cutoffs.postedFrom,
    cutoffs.ecotrackFrom,
  );
  const { current: economics, previous: previousEconomics } = await loadEconomicsPair(
    db,
    catalogFilters,
    cutoffs.postedFrom,
  );
  const [
    websiteProducts,
    basketPairs,
    sources,
    operationalProducts,
    previousOperationalProducts,
    operationalGeography,
    operationalCommunes,
    productMetaAssociations,
    customerEconomics,
    previousCustomerEconomics,
    metaRegions,
    operationalSummary,
    previousOperationalSummary,
    completion,
  ] = await Promise.all([
    getLiveWebsiteProductMetrics(
      db,
      statsInput(storefrontFilters.startDate, storefrontFilters.endDate),
    ),
    loadBasketPairs(db, catalogFilters),
    loadSourceHealth(db, filters, economics, cutoffs.orders ?? undefined),
    loadOperationalProducts(db, catalogFilters, economics.settings.defaultReturnRate),
    previousAnalytics
      ? loadOperationalProducts(db, previousAnalytics, economics.settings.defaultReturnRate)
      : Promise.resolve([] as OperationalProductRow[]),
    loadOperationalGeography(db, catalogFilters),
    loadOperationalCommunes(db, catalogFilters),
    loadProductMetaAssociations(db, catalogFilters),
    loadCustomerEconomics(
      db,
      catalogFilters,
      economics.settings.fxRate,
      economics.settings.defaultReturnRate === 100,
    ),
    previousAnalytics
      ? loadCustomerEconomics(
          db,
          previousAnalytics,
          economics.settings.fxRate,
          economics.settings.defaultReturnRate === 100,
        )
      : Promise.resolve(null),
    loadMetaRegions(db, catalogFilters),
    loadCatalogOperationalSummary(db, catalogFilters),
    previousAnalytics
      ? loadCatalogOperationalSummary(db, previousAnalytics)
      : Promise.resolve(null),
    loadCohortCompletionPair(db, catalogFilters, 1 - economics.settings.defaultReturnRate / 100),
  ]);
  const currentWebsiteProducts = websiteProducts as LiveWebsiteProductMetric[];
  const currentOperationalProducts = operationalProducts as OperationalProductRow[];
  const oldOperationalProducts = previousOperationalProducts as OperationalProductRow[];
  const websiteByProduct = new Map(currentWebsiteProducts.map((row) => [String(row.id), row]));
  const previousOperational = new Map<string, OperationalProductRow>(
    oldOperationalProducts.map((row) => [row.id, row]),
  );
  const metaByProduct = new Map<string, ProductMetaAssociation[]>();
  for (const association of productMetaAssociations) {
    const rows = metaByProduct.get(association.productId) ?? [];
    if (rows.length < 5) rows.push(association);
    metaByProduct.set(association.productId, rows);
  }
  const fallbackOperational: OperationalProductRow[] = currentWebsiteProducts.map((row) => ({
    id: String(row.id),
    title: row.title,
    sku: row.sku,
    categoryName: row.categoryName,
    brandName: row.brandName,
    postedOrders: 0,
    postedUnits: 0,
    paidOrders: 0,
    paidUnits: 0,
    returnedOrders: 0,
    activeOrders: 0,
    terminalPaidRatePct: null,
    costCoveragePct: null,
    projectedContributionDzd: null,
    deliveryMedianHours: null,
    paymentMedianHours: null,
    deliverySamples: 0,
  }));
  const products = (
    currentOperationalProducts.length ? currentOperationalProducts : fallbackOperational
  )
    .slice(0, 100)
    .map((operational) => {
      const website = websiteByProduct.get(operational.id);
      const oldOperational = previousOperational.get(operational.id);
      return {
        id: operational.id,
        title: operational.title,
        sku: operational.sku ?? website?.sku ?? null,
        categoryName: operational.categoryName ?? website?.categoryName ?? null,
        brandName: operational.brandName ?? website?.brandName ?? null,
        postedOrders: operational.postedOrders,
        postedUnits: operational.postedUnits,
        paidOrders: operational.paidOrders,
        returnedOrders: operational.returnedOrders,
        activeOrders: operational.activeOrders,
        terminalPaidRatePct: operational.terminalPaidRatePct,
        costCoveragePct: operational.costCoveragePct,
        projectedContributionDzd: operational.projectedContributionDzd,
        deliveryMedianHours: operational.deliveryMedianHours,
        metaAssociations: metaByProduct.get(operational.id) ?? [],
        viewCount: website?.viewCount ?? 0,
        websiteConversionRate: website?.websiteConversionRate ?? 0,
        changes: {
          unitsPct: metricChange(operational.postedUnits, oldOperational?.postedUnits ?? null),
        },
      };
    });
  const geography = operationalGeography as OperationalGeographyRow[];
  const completionComparisonAvailable = Boolean(
    completion?.previous &&
    previousEconomics &&
    cohortCompletionCovers(economics.summary.postedOrders, completion.current) &&
    cohortCompletionCovers(previousEconomics.summary.postedOrders, completion.previous),
  );
  return {
    data: {
      kind: 'catalog' as const,
      metrics: [
        metric(
          'postedUnits',
          operationalSummary.postedUnits,
          previousOperationalSummary?.postedUnits ?? null,
          'number',
        ),
        metricWithProjectedComparison(
          'paidUnits',
          operationalSummary.paidUnits,
          previousOperationalSummary?.paidUnits ?? null,
          'number',
          {
            value: completionComparisonAvailable
              ? (completion?.current.projectedPaidUnits ?? null)
              : null,
            previous: completionComparisonAvailable
              ? (completion?.previous?.projectedPaidUnits ?? null)
              : null,
          },
        ),
        metric(
          'adjustedProfit',
          economics.summary.adjustedProfitDzd,
          previousEconomics?.summary.adjustedProfitDzd ?? null,
          'dzd',
        ),
        metric(
          'customers',
          customerEconomics.summary.customers,
          previousCustomerEconomics?.summary.customers ?? null,
          'number',
        ),
        metric(
          'repeatRate',
          customerEconomics.summary.repeatRate,
          previousCustomerEconomics?.summary.repeatRate ?? null,
          'percent',
        ),
      ],
      products,
      coverage: economics.coverage,
      basketPairs,
      geography: {
        wilayas: geography,
        communes: operationalCommunes,
        metaRegions,
      },
      customers: customerEconomics,
    },
    effectiveRanges: [
      effectiveRange('catalog', catalogFilters, ['orders', 'ecotrack', 'assumptions']),
      effectiveRange('catalogStorefront', storefrontFilters, ['orders', 'storefront']),
    ],
    sources,
    warnings: [...sourceWarnings(sources)],
  };
}
