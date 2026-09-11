import { ADMIN_AI_ANALYTICS_PROFIT_KNOWLEDGE } from '../admin-ai-analytics-contract';
import type { AnalyticsSource } from '../analytics';
import { record } from './focus-contract';
import {
  type AdminAiAnalyticsFieldContract,
  type AdminAiAnalyticsFocusDimension,
  type DatasetSpec,
} from './focus-contract';

const fieldDefinitions: Record<string, string> = {
  id: 'Canonical entity identifier.',
  key: 'Canonical lifecycle, signal, or funnel-stage key; interpret it using the owning dataset definition.',
  name: 'Canonical entity or aggregate label.',
  title: 'Immutable or current canonical display title for the entity.',
  sku: 'Current product SKU; null means no SKU is recorded.',
  day: 'Calendar day on the owning dataset date basis.',
  date: 'Calendar date on the owning dataset date basis.',
  bucket: 'Canonical time-series bucket at the requested grain.',
  weekStart: 'Friday-start calculator or posting-cohort week.',
  submittedOrders:
    'Incoming local orders created in the period; demand, not completed sales or cash.',
  confirmedOrders: 'Orders approved locally; confirmation is not shipment.',
  postedOrders: 'Orders at their first transition to local status 11.',
  postedUnits: 'Order-line units attached to first-posted orders.',
  activeOrders:
    'Posted orders still active after effective EcoTrack status and stale-failure filtering.',
  activeShipments: 'Active EcoTrack shipments after effective-status and stale-failure filtering.',
  untrackedOrders: 'Posted orders without a usable EcoTrack state.',
  untrackedShipments: 'Posted shipments without a usable EcoTrack state.',
  deliveredOrders:
    'Orders with an EcoTrack delivery event; delivery does not establish COD receipt.',
  delivered: 'Orders with an EcoTrack delivery event; delivery does not establish COD receipt.',
  paidOrders:
    'Orders in EcoTrack payed or paye_et_archive outcomes; both are legitimate paid outcomes.',
  forecastPaidOrders:
    'Modeled paid outcomes expected on the future EcoTrack paid/archive recognition date from recent observed daily outcomes.',
  paidUnits: 'Order-line units attached to EcoTrack payed or paye_et_archive outcomes.',
  paid: 'Orders in EcoTrack payed or paye_et_archive outcomes; not merely delivered orders.',
  returnedOrders: 'Orders in the historical return terminal outcome.',
  returned: 'Orders in the historical return terminal outcome.',
  cancelledOrders:
    'Locally or provider-cancelled orders, excluded from active and mature return populations.',
  orders:
    'Count of orders in this exact owning stage or aggregate; stages are not interchangeable.',
  purchases:
    'Submitted local Storefront orders when used in Storefront data; incoming demand, not paid sales.',
  bricOrders:
    'Exactly captured Bricomaitre orders attributed to the Meta entity, not Meta-reported purchases.',
  metaPurchases: 'Purchases reported by Meta; kept separate from Bricomaitre orders.',
  amountDzd:
    'DZD amount attached to this exact lifecycle stage; it is not automatically revenue or received cash.',
  pipelineCodDzd: 'COD value currently in the operational pipeline, not received cash.',
  codDzd: 'EcoTrack COD recognized for the owning paid or pipeline stage.',
  grossProfitDzd:
    'Order value minus product cost before return assumptions, advertising, and operating costs.',
  adjustedProfitDzd: ADMIN_AI_ANALYTICS_PROFIT_KNOWLEDGE.adjustedProfit,
  netProfitDzd: ADMIN_AI_ANALYTICS_PROFIT_KNOWLEDGE.netProfit,
  trueProfitDzd: ADMIN_AI_ANALYTICS_PROFIT_KNOWLEDGE.trueProfit,
  profitDzd:
    'Automatic paid contribution: EcoTrack COD minus estimated tariff and product cost; not whole-business profit.',
  feesDzd: 'Estimated EcoTrack tariff attached to recognized paid outcomes.',
  netRecoveredDzd: 'EcoTrack COD minus the estimated EcoTrack tariff before product cost.',
  productCostDzd:
    'Immutable order-line purchase cost where available, with the canonical 30% fallback margin otherwise.',
  projectedContributionDzd:
    'Planning-rate contribution for first-posted demand; not delivered or received cash.',
  projectedTrueProfitDzd:
    'Modeled planning contribution minus comparable Meta and operating costs.',
  deliveredTrueProfitDzd:
    'Delivered-cohort contribution minus comparable Meta and operating costs; not received cash.',
  paidTrueProfitDzd: 'Paid contribution minus comparable Meta and operating costs.',
  automaticPaidProfitDzd: 'Automatic EcoTrack paid contribution; not whole-business true profit.',
  realizedProfitDzd:
    'Paid/settled contribution recognized from provider outcomes; not whole-business true profit.',
  realizedProfitAfterAdsDzd:
    'Paid/settled contribution minus comparable Meta ad cost; operating costs are not deducted.',
  adCostDzd: 'Meta spend converted to DZD with the snapshotted manual FX rate.',
  attributedAdCostDzd: 'Meta ad cost over the exact captured-attribution spend window.',
  spendEur: 'Meta spend in EUR on the Meta reporting date.',
  profitX: ADMIN_AI_ANALYTICS_PROFIT_KNOWLEDGE.profitX,
  projectedProfitX: 'Modeled adjusted profit divided by comparable Meta ad cost.',
  paidProfitX:
    'Paid contribution divided by comparable attributed Meta ad cost; not planning Profit ×.',
  profitXBeforeReturns: 'Gross profit divided by comparable Meta ad cost before planning returns.',
  settledOrders: 'Orders included in the recognized provider settlement contribution.',
  offPipelineSales:
    'Completed sales recorded only as financial contribution outside the order and fulfilment pipeline.',
  costCoveragePct: 'Share backed by exact immutable order-line purchase-cost snapshots.',
  profitCoveragePct: 'Share of contribution rows backed by sufficient exact cost inputs.',
  projectedCoveragePct:
    'Share of projected economics backed by exact immutable purchase-cost snapshots.',
  p75: '75th-percentile field measurement; this is not an arithmetic average.',
  providerAmountCoveragePct: 'Share of orders whose amount comes directly from EcoTrack.',
  providerAmountValueCoveragePct:
    'Share of DZD value sourced directly from EcoTrack rather than a fallback.',
  outcomeSpendCoveragePct:
    'Share of attributed outcome cohort with comparable Meta spend coverage.',
  attributionCoveragePct: 'Share covered by exact captured first-party attribution.',
  terminalPaidRatePct:
    'Paid divided by paid plus returned terminal outcomes; active and unresolved orders are excluded.',
  observedReturnRatePct:
    'Returned divided by paid plus returned terminal outcomes; descriptive, not the planning rate.',
  conversionRate: 'Submitted local orders divided by canonical first-party Storefront sessions.',
  conversionRatePct: 'Submitted local orders divided by canonical first-party Storefront sessions.',
  websiteConversionRate:
    'Submitted local product demand divided by canonical first-party Storefront exposure.',
  sessions: 'Distinct canonical first-party Storefront sessions.',
  pageViews: 'First-party Storefront page-view events; not distinct sessions.',
  productViews: 'First-party product-view activity on the owning aggregation basis.',
  addToCarts: 'First-party add-to-cart activity on the owning aggregation basis.',
  checkoutStarts: 'First-party checkout-start activity on the owning aggregation basis.',
  influencedOrders:
    'Submitted orders associated with Storefront-assistant usage; demand, not paid outcomes.',
  impressions: 'Impressions reported by the owning advertising or Search Console source.',
  clicks: 'Clicks reported by the owning source.',
  outboundClicks: 'Outbound clicks reported by Meta.',
  ctrPct: 'Clicks divided by impressions for the owning source.',
  outboundCtrPct: 'Meta outbound clicks divided by impressions.',
  cpmEur: 'Meta spend EUR per one thousand impressions.',
  averagePosition: 'Impression-weighted Search Console position; a lower number is better.',
  position: 'Impression-weighted Search Console position; a lower number is better.',
  medianAgeHours: 'Median elapsed calendar hours in the current operational state.',
  deliveryMedianHours: 'Median elapsed calendar hours from first posting to recorded delivery.',
  paymentMedianHours: 'Median elapsed calendar hours from first posting to recorded payment.',
  averageAttempts:
    'Average recorded EcoTrack delivery attempts; zero can reflect missing attempt telemetry.',
  staleOrders: 'Orders excluded or flagged by the canonical stale-progress timing rule.',
  confidencePct:
    'Modeled confidence for the pending-demand stage based on historical conversion evidence.',
  mature: 'Whether the cohort is old and resolved enough for terminal-outcome interpretation.',
  isPartial: 'Whether the time bucket is incomplete or includes modeled completion.',
};

const searchDimensions = new Set<AdminAiAnalyticsFocusDimension>([
  'search_trend',
  'search_opportunities',
  'search_pages',
  'search_devices',
  'search_countries',
  'search_appearances',
  'search_index_issues',
  'search_sitemaps',
]);

const storefrontDimensions = new Set<AdminAiAnalyticsFocusDimension>([
  'storefront_trend',
  'storefront_funnel',
  'storefront_paths',
  'storefront_searches',
  'storefront_products',
  'storefront_sources',
  'web_vitals',
  'landing_pages',
  'storefront_assistant',
]);

const metaNativeField =
  /^(spendEur|impressions|clicks|linkClicks|outboundClicks|uniqueOutboundClicks|landingPageViews|addToCarts|checkouts|metaPurchases|purchaseValue|video.*|qualityRanking|engagementRateRanking|conversionRateRanking|ctrPct|outboundCtrPct|landingViewRatePct|cpmEur|platformRoas)$/u;

const localDemandField =
  /^(submittedOrders|confirmedOrders|postedOrders|postedUnits|purchases|bricOrders|orders|orderValueDzd)$/u;

const providerOutcomeField =
  /^(activeOrders|activeShipments|untrackedOrders|untrackedShipments|deliveredOrders|delivered|paidOrders|forecastPaidOrders|paidUnits|paid|returnedOrders|returned|cancelledOrders|terminalPaidRatePct|observedReturnRatePct|matureObservedReturnRatePct|averageAttempts|deliveryMedianHours|paymentMedianHours|providerAmount.*|codDzd|feesDzd|netRecoveredDzd|settledOrders)$/u;

const attributionOutcomeField =
  /^(bricOrders|confirmedOrders|postedOrders|deliveredOrders|paidOrders|returnedOrders|costPer.*Dzd|attributedAdCostDzd|outcomeSpendCoveragePct|attributionCoveragePct|projectedAdjustedProfitDzd|automaticPaidProfitDzd|projectedProfitX|paidProfitX|profitCoveragePct)$/u;

const storefrontOrderField =
  /^(purchases|submittedOrders|submittedOrderSessions|orders|influencedOrders|confirmedOrders|paidOrders|conversionRate|conversionRatePct|websiteConversionRate)$/u;

const storefrontTelemetryField =
  /^(sessions|pageViews|productViews|viewCount|views|addToCarts|checkoutStarts|productViewSessions|cartSessions|checkoutSessions|opens|messages|resultClicks|users|events|engagementRate|errorRate|returningJourneys|.*WebVital.*|lcp|cls|inp|fcp|ttfb)$/iu;

function fieldSources(
  field: string,
  spec: DatasetSpec,
  dimension: AdminAiAnalyticsFocusDimension,
): AnalyticsSource['key'][] {
  if (searchDimensions.has(dimension)) return ['searchConsole'];
  if (dimension === 'operating_costs') return ['assumptions'];
  if (dimension === 'paid_timeline') return ['orders', 'ecotrack'];
  if (
    dimension === 'meta_regions' ||
    dimension === 'meta_daily' ||
    dimension === 'tracking_events'
  ) {
    return field === 'adCostDzd' ? ['meta', 'assumptions'] : ['meta'];
  }
  if (['campaigns', 'adsets', 'ads', 'attribution_maturation'].includes(dimension)) {
    if (field === 'adCostDzd') return ['meta', 'assumptions'];
    if (metaNativeField.test(field)) return ['meta'];
    if (/^costPer/u.test(field)) return ['orders', 'ecotrack', 'meta', 'assumptions'];
    if (/^(attributedAdCostDzd|outcomeSpendCoveragePct)$/u.test(field)) {
      return ['orders', 'meta', 'assumptions'];
    }
    if (/^(projectedAdjustedProfitDzd|projectedProfitX)$/u.test(field)) {
      return ['orders', 'meta', 'assumptions'];
    }
    if (field === 'paidProfitX') return ['orders', 'ecotrack', 'meta', 'assumptions'];
    if (/^(automaticPaidProfitDzd|profitCompleteOrders|profitCoveragePct)$/u.test(field)) {
      return ['orders', 'ecotrack'];
    }
    if (/^(deliveredOrders|paidOrders|returnedOrders)$/u.test(field)) {
      return ['orders', 'ecotrack'];
    }
    if (localDemandField.test(field)) return ['orders'];
  }
  if (storefrontDimensions.has(dimension)) {
    if (field === 'paidOrders') return ['orders', 'ecotrack', 'storefront'];
    if (storefrontOrderField.test(field)) return ['orders', 'storefront'];
    if (storefrontTelemetryField.test(field)) return ['storefront'];
  }
  if (dimension === 'products') {
    if (field === 'viewCount') return ['storefront'];
    if (field === 'websiteConversionRate') return ['orders', 'storefront'];
    if (/^(metaAssociations)$/u.test(field)) return ['meta'];
  }
  if (/^(costCoveragePct|projectedCoveragePct)$/u.test(field)) return ['orders'];
  if (field === 'adCostDzd' || /AdCostDzd$/u.test(field)) return ['meta', 'assumptions'];
  if (metaNativeField.test(field)) return ['meta'];
  if (providerOutcomeField.test(field)) return ['orders', 'ecotrack'];
  if (localDemandField.test(field)) return ['orders'];
  if (/profit|contribution|productCost|grossProfit|adjusted/iu.test(field)) {
    return /paid|realized|settled/iu.test(field)
      ? ['orders', 'ecotrack', 'assumptions']
      : ['orders', 'assumptions'];
  }
  return spec.sources;
}

function fieldDateBasis(
  field: string,
  spec: DatasetSpec,
  dimension: AdminAiAnalyticsFocusDimension,
) {
  if (searchDimensions.has(dimension)) return spec.dateBasis;
  if (
    dimension === 'meta_regions' ||
    dimension === 'meta_daily' ||
    dimension === 'tracking_events'
  ) {
    return 'Meta reporting date.';
  }
  if (['campaigns', 'adsets', 'ads'].includes(dimension)) {
    if (metaNativeField.test(field) || field === 'adCostDzd') return 'Meta reporting date.';
    if (attributionOutcomeField.test(field)) {
      return 'Captured order-attribution date with later local and EcoTrack outcomes observed.';
    }
  }
  if (dimension === 'attribution_maturation') {
    return 'Captured order-attribution cohort date with later outcomes observed.';
  }
  if (dimension === 'paid_timeline') return 'EcoTrack paid/archive recognition date.';
  if (dimension === 'storefront_assistant' && field === 'paidOrders') {
    return 'Assistant-influenced order-created/session cohort with later EcoTrack paid outcome observed.';
  }
  if (dimension === 'storefront_assistant' && field === 'confirmedOrders') {
    return 'Assistant-influenced order-created/session cohort with later local confirmation observed.';
  }
  if (dimension === 'posting_cohorts' || dimension === 'products') {
    if (field === 'viewCount') {
      return 'First-party Storefront event date over its separately declared retained range.';
    }
    if (field === 'websiteConversionRate') {
      return 'Order-created and first-party Storefront event dates over their shared retained range.';
    }
    return 'Original first-posted cohort date, regardless of later outcome date.';
  }
  if (dimension === 'cash_pipeline' || dimension === 'paid_funnel') {
    return 'Stage-specific date basis identified by the row key; stages are not interchangeable.';
  }
  if (storefrontDimensions.has(dimension)) {
    return storefrontOrderField.test(field)
      ? 'Order-created date and first-party Storefront session date over their shared range.'
      : 'First-party Storefront event or session date.';
  }
  if (field === 'submittedOrders' || field === 'purchases') return 'Order-created date.';
  if (field === 'confirmedOrders') return 'Local confirmation date.';
  if (/^(postedOrders|postedUnits)$/u.test(field)) return 'First-posted date.';
  if (/^(deliveredOrders|delivered)$/u.test(field)) return 'EcoTrack delivery event date.';
  if (/^(paidOrders|paidUnits|paid)$/u.test(field))
    return 'EcoTrack paid/archive recognition date.';
  if (field === 'forecastPaidOrders') return 'Future EcoTrack paid/archive recognition date.';
  return spec.dateBasis;
}

function fieldNullMeaning(field: string) {
  if (/Pct$|Rate$|ProfitX$|Roas$/iu.test(field)) {
    return 'Unavailable because its denominator, matched coverage, or comparable inputs are absent; never interpret null as zero or infinity.';
  }
  if (/Ranking$/u.test(field)) {
    return 'Meta did not report a ranking for this entity and period; it is not a neutral or zero rank.';
  }
  if (/^(day|date|bucket|weekStart|.*At)$/u.test(field)) {
    return 'No usable timestamp is available on this field’s declared date basis.';
  }
  return 'Unavailable, immature, or not comparable; never zero unless the value is explicitly 0.';
}

function fieldUnit(field: string, sample: unknown): AdminAiAnalyticsFieldContract['unit'] {
  if (/Dzd$/u.test(field)) return 'dzd';
  if (/Eur$/u.test(field)) return 'eur';
  if (typeof sample === 'number' && /Pct$|Rate$/u.test(field)) return 'percent';
  if (typeof sample === 'number' && /ProfitX$|Roas$/iu.test(field)) return 'ratio';
  if (/Hours$/u.test(field)) return 'hours';
  if (/Seconds$/u.test(field)) return 'seconds';
  if (/^(day|date|bucket|weekStart|.*At)$/u.test(field)) return 'date';
  if (typeof sample === 'number') return 'number';
  if (typeof sample === 'boolean') return 'boolean';
  return 'text';
}

function scalarFieldKeys(rows: unknown[]) {
  const keys = new Set<string>();
  for (const row of rows) {
    const value = record(row);
    if (!value) continue;
    for (const [key, child] of Object.entries(value)) {
      if (child == null || ['string', 'number', 'boolean'].includes(typeof child)) keys.add(key);
    }
  }
  return [...keys];
}

export function fieldContracts(
  rows: unknown[],
  spec: DatasetSpec,
  dimension: AdminAiAnalyticsFocusDimension,
): AdminAiAnalyticsFieldContract[] {
  const samples = rows
    .map(record)
    .filter((value): value is Record<string, unknown> => Boolean(value));
  return scalarFieldKeys(rows).map((field) => {
    const sample = samples.find((row) => row[field] != null)?.[field];
    const modeled =
      dimension === 'forecast' ||
      dimension === 'leading_forecast' ||
      /projected|expected|forecast/iu.test(field);
    const costDependent = /profit|contribution|productCost|grossProfit|adjusted/iu.test(field);
    const outcomeDependent = /paid|delivered|returned|terminal|attempt/iu.test(field);
    const attributionDependent =
      dimension === 'attribution_maturation' ||
      (['campaigns', 'adsets', 'ads'].includes(dimension) && attributionOutcomeField.test(field)) ||
      /attributed|attribution/iu.test(field);
    return {
      field,
      definition:
        fieldDefinitions[field] ??
        `Canonical ${field} field from ${dimension}; interpret it only within the owning dataset contract.`,
      unit: fieldUnit(field, sample),
      dateBasis: fieldDateBasis(field, spec, dimension),
      sources: fieldSources(field, spec, dimension),
      nullMeaning: fieldNullMeaning(field),
      modeled,
      estimation: costDependent
        ? 'May use the canonical 30% fallback margin where immutable purchase cost is missing; consult exact-cost coverage.'
        : null,
      maturity: outcomeDependent
        ? 'Recent cohorts can be unresolved; interpret terminal outcomes with the dataset maturity evidence.'
        : null,
      attribution: attributionDependent
        ? 'Exact retained Meta entity attribution begins around 2026-08-10 and immutable capture begins 2026-08-17; absent rows do not prove an entity did not run.'
        : null,
    };
  });
}
