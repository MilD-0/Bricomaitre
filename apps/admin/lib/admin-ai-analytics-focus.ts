import { z } from 'zod';

import type {
  Analytics2EffectiveRange,
  Analytics2Payload,
  Analytics2Source,
  Analytics2View,
} from './analytics2';
import { ADMIN_AI_ANALYTICS_PROFIT_KNOWLEDGE } from './admin-ai-analytics-contract';

const adminAiAnalyticsFocusDimensions = [
  'economics_timeline',
  'paid_timeline',
  'cash_pipeline',
  'forecast',
  'signals',
  'posting_cohorts',
  'friday_weeks',
  'campaigns',
  'adsets',
  'ads',
  'attribution_maturation',
  'meta_daily',
  'profit_efficiency',
  'paid_funnel',
  'tracking_events',
  'shipment_states',
  'attempt_outcomes',
  'fulfillment_trend',
  'leading_forecast',
  'storefront_trend',
  'storefront_funnel',
  'storefront_paths',
  'storefront_searches',
  'storefront_products',
  'storefront_sources',
  'web_vitals',
  'landing_pages',
  'storefront_assistant',
  'search_trend',
  'search_opportunities',
  'search_pages',
  'search_devices',
  'search_countries',
  'search_appearances',
  'search_index_issues',
  'search_sitemaps',
  'products',
  'basket_pairs',
  'wilayas',
  'communes',
  'meta_regions',
  'customers',
  'operating_costs',
  'daily_assumptions',
] as const;

export type AdminAiAnalyticsFocusDimension = (typeof adminAiAnalyticsFocusDimensions)[number];

const adminAiAnalyticsSelectorDimensionValues = [
  'campaigns',
  'adsets',
  'ads',
  'attribution_maturation',
  'tracking_events',
  'shipment_states',
  'attempt_outcomes',
  'storefront_paths',
  'storefront_searches',
  'storefront_products',
  'storefront_sources',
  'web_vitals',
  'landing_pages',
  'search_opportunities',
  'search_pages',
  'search_devices',
  'search_countries',
  'search_appearances',
  'search_index_issues',
  'search_sitemaps',
  'products',
  'basket_pairs',
  'wilayas',
  'communes',
  'meta_regions',
  'customers',
  'operating_costs',
  'daily_assumptions',
] as const satisfies readonly AdminAiAnalyticsFocusDimension[];

const adminAiAnalyticsSelectorDimensions = new Set<AdminAiAnalyticsFocusDimension>(
  adminAiAnalyticsSelectorDimensionValues,
);
const adminAiAnalyticsFixedDimensionValues = adminAiAnalyticsFocusDimensions.filter(
  (dimension) => !adminAiAnalyticsSelectorDimensions.has(dimension),
) as unknown as [AdminAiAnalyticsFocusDimension, ...AdminAiAnalyticsFocusDimension[]];

const adminAiAnalyticsFocusLimitSchema = z
  .number()
  .int()
  .min(1)
  .max(100)
  .default(20)
  .describe('Maximum matched rows to return.');

const adminAiAnalyticsSelectorFocusSchema = z
  .object({
    dimension: z
      .enum(adminAiAnalyticsSelectorDimensionValues)
      .describe('Entity dataset; supports search and identifier filters.'),
    search: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .optional()
      .describe('Exact or partial entity label to match inside the selected dataset.'),
    identifiers: z
      .array(z.string().trim().min(1).max(200))
      .max(100)
      .default([])
      .describe('Known canonical IDs or exact identifier strings to match; never invent them.'),
    limit: adminAiAnalyticsFocusLimitSchema,
  })
  .strict();

const adminAiAnalyticsFixedFocusSchema = z
  .object({
    dimension: z
      .enum(adminAiAnalyticsFixedDimensionValues)
      .describe('Fixed aggregate or timeline dataset; does not support selector filters.'),
    search: z
      .never()
      .optional()
      .describe('Omit this field. Fixed datasets cannot be filtered by search text.'),
    identifiers: z
      .array(z.never())
      .max(0)
      .optional()
      .describe('Omit this field. Fixed datasets cannot be filtered by identifiers.'),
    limit: adminAiAnalyticsFocusLimitSchema,
  })
  .strict()
  .transform((value) => ({
    ...value,
    search: undefined as string | undefined,
    identifiers: [] as string[],
  }));

export const adminAiAnalyticsFocusSchema = z
  .union([adminAiAnalyticsSelectorFocusSchema, adminAiAnalyticsFixedFocusSchema])
  .describe('Optional underlying dataset. Omit for headline metrics or source coverage.');

export type AdminAiAnalyticsFocus = z.infer<typeof adminAiAnalyticsFocusSchema>;

type DatasetSpec = {
  views: Analytics2View[];
  paths: Partial<Record<Analytics2View, string[]>>;
  relatedPaths?: Partial<Record<Analytics2View, string[]>>;
  relatedDefinition?: string;
  effectiveRangeKey: string;
  additionalEffectiveRangeKeys?: string[];
  definition: string;
  dateBasis: string;
  sources: Analytics2Source['key'][];
  totalSemantics: string;
  rowSemantics?: Record<
    string,
    {
      definition: string;
      dateBasis: string;
      sources: Analytics2Source['key'][];
      modeled?: boolean;
      maturity?: string | null;
      attribution?: string | null;
    }
  >;
};

export type AdminAiAnalyticsFieldContract = {
  field: string;
  definition: string;
  unit:
    | 'dzd'
    | 'eur'
    | 'number'
    | 'percent'
    | 'ratio'
    | 'hours'
    | 'seconds'
    | 'date'
    | 'text'
    | 'boolean';
  dateBasis: string;
  sources: Analytics2Source['key'][];
  nullMeaning: string;
  modeled: boolean;
  estimation: string | null;
  maturity: string | null;
  attribution: string | null;
};

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
): Analytics2Source['key'][] {
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

function fieldContracts(
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

const rankedView =
  'Rows preserve the canonical workspace ranking/filter. They are a decision view, not the complete population; never sum them to produce a headline total.';
const seriesView =
  'Rows are the canonical time series for the declared effective range; null is unavailable, not zero.';

export const adminAiAnalyticsDatasetSpecs: Record<AdminAiAnalyticsFocusDimension, DatasetSpec> = {
  economics_timeline: {
    views: ['command', 'money'],
    paths: { command: ['trajectory'], money: ['series'] },
    effectiveRangeKey: 'economics',
    definition:
      'Observed calculator economics with explicitly separate projected completion fields for open buckets.',
    dateBasis: 'Calculator accounting date led by first-posted orders.',
    sources: ['orders', 'meta', 'assumptions'],
    totalSemantics: seriesView,
  },
  paid_timeline: {
    views: ['money'],
    paths: { money: ['paidSeries'] },
    effectiveRangeKey: 'paid',
    definition: 'Automatic paid contribution recognized from EcoTrack paid/archive outcomes.',
    dateBasis: 'EcoTrack paid/archive recognition date.',
    sources: ['orders', 'ecotrack'],
    totalSemantics: seriesView,
  },
  cash_pipeline: {
    views: ['command', 'fulfillment'],
    paths: { command: ['fulfillment', 'cashPipeline'], fulfillment: ['cashPipeline'] },
    effectiveRangeKey: 'fulfillment',
    definition:
      'Submitted, confirmed, posted, active, delivered, paid, and unresolved operational value stages without treating demand as cash.',
    dateBasis: 'Stage-specific lifecycle date over the shared fulfillment range.',
    sources: ['orders', 'ecotrack'],
    totalSemantics: rankedView,
    rowSemantics: {
      submitted: {
        definition: 'Incoming submitted demand still awaiting local confirmation.',
        dateBasis: 'Order-created pending-demand date.',
        sources: ['orders'],
        modeled: false,
      },
      confirmed: {
        definition: 'Locally confirmed demand still awaiting first posting.',
        dateBasis: 'Local confirmation pending-demand date.',
        sources: ['orders'],
        modeled: false,
      },
      inTransit: {
        definition: 'Active EcoTrack shipment after effective-status and stale-failure filtering.',
        dateBasis: 'Original first-posted cohort observed through latest usable EcoTrack state.',
        sources: ['orders', 'ecotrack'],
        maturity: 'Open operational population, not a terminal outcome.',
      },
      deliveredAwaitingCollection: {
        definition: 'Delivered EcoTrack shipment whose COD has not yet been recorded as collected.',
        dateBasis: 'Original first-posted cohort observed through latest usable EcoTrack state.',
        sources: ['orders', 'ecotrack'],
        maturity: 'Delivered is not paid cash.',
      },
      collectedAwaitingPayout: {
        definition: 'EcoTrack indicates COD collection but merchant payout is still pending.',
        dateBasis: 'Original first-posted cohort observed through latest usable EcoTrack state.',
        sources: ['orders', 'ecotrack'],
      },
      paymentReady: {
        definition: 'EcoTrack marks the shipment payout as ready but not yet in a paid outcome.',
        dateBasis: 'Original first-posted cohort observed through latest usable EcoTrack state.',
        sources: ['orders', 'ecotrack'],
      },
      paid: {
        definition: 'EcoTrack payed or paye_et_archive outcome; both are legitimate paid outcomes.',
        dateBasis: 'EcoTrack paid/archive recognition date.',
        sources: ['orders', 'ecotrack'],
      },
    },
  },
  forecast: {
    views: ['command', 'money'],
    paths: { command: ['forecast', 'days'], money: ['forecast'] },
    additionalEffectiveRangeKeys: ['fulfillment', 'paid'],
    effectiveRangeKey: 'economics',
    definition:
      'Modeled future economics and first postings from historical and pending-demand evidence, with paid outcomes from recent recognition-day history.',
    dateBasis: 'Future calculator accounting date.',
    sources: ['orders', 'ecotrack', 'meta', 'assumptions'],
    totalSemantics: 'Every row is modeled, not observed.',
  },
  signals: {
    views: ['command'],
    paths: { command: ['signals'] },
    effectiveRangeKey: 'economics',
    definition:
      'Deterministic canonical business signals derived from current metrics and coverage.',
    dateBasis: 'The owning metric date basis.',
    sources: ['orders', 'ecotrack', 'meta', 'assumptions'],
    totalSemantics: rankedView,
  },
  posting_cohorts: {
    views: ['money', 'fulfillment'],
    paths: { money: ['cohorts'], fulfillment: ['cohorts'] },
    effectiveRangeKey: 'fulfillment',
    definition:
      'Original first-posted cohorts observed through later delivery, return, and payment outcomes.',
    dateBasis: 'Original first-posted date, regardless of later outcome date.',
    sources: ['orders', 'ecotrack'],
    totalSemantics: 'Recent cohorts can be immature and must be labeled with their maturity state.',
  },
  friday_weeks: {
    views: ['money'],
    paths: { money: ['weeks'] },
    effectiveRangeKey: 'economics',
    definition: 'Friday-start calculator weeks after the canonical rest-day roll-forward.',
    dateBasis: 'Friday-start calculator accounting week.',
    sources: ['orders', 'meta', 'assumptions'],
    totalSemantics: seriesView,
  },
  campaigns: {
    views: ['acquisition'],
    paths: { acquisition: ['entities', 'campaigns'] },
    effectiveRangeKey: 'acquisition',
    definition: 'Meta campaign performance joined only to exactly attributed Bricomaitre outcomes.',
    dateBasis: 'Shared Meta spend and captured order-attribution range.',
    sources: ['orders', 'ecotrack', 'meta'],
    totalSemantics: rankedView,
    relatedPaths: { acquisition: ['entityDaily', 'campaigns'] },
    relatedDefinition: 'Daily canonical series for the matched campaign identifiers.',
  },
  adsets: {
    views: ['acquisition'],
    paths: { acquisition: ['entities', 'adsets'] },
    effectiveRangeKey: 'acquisition',
    definition: 'Meta ad-set performance joined only to exactly attributed Bricomaitre outcomes.',
    dateBasis: 'Shared Meta spend and captured order-attribution range.',
    sources: ['orders', 'ecotrack', 'meta'],
    totalSemantics: rankedView,
    relatedPaths: { acquisition: ['entityDaily', 'adsets'] },
    relatedDefinition: 'Daily canonical series for the matched ad-set identifiers.',
  },
  ads: {
    views: ['acquisition'],
    paths: { acquisition: ['entities', 'ads'] },
    effectiveRangeKey: 'acquisition',
    definition: 'Meta ad performance joined only to exactly attributed Bricomaitre outcomes.',
    dateBasis: 'Shared Meta spend and captured order-attribution range.',
    sources: ['orders', 'ecotrack', 'meta'],
    totalSemantics: rankedView,
    relatedPaths: { acquisition: ['entityDaily', 'ads'] },
    relatedDefinition: 'Daily canonical series for the matched ad identifiers.',
  },
  attribution_maturation: {
    views: ['acquisition'],
    paths: { acquisition: ['breakdowns', 'maturation'] },
    effectiveRangeKey: 'acquisition',
    definition: 'Captured Meta entity cohorts and their observed Bricomaitre outcome maturation.',
    dateBasis: 'Captured order attribution date with later outcomes observed.',
    sources: ['orders', 'ecotrack', 'meta'],
    totalSemantics:
      'A missing campaign means exact first-party attribution is unavailable for that cohort, not that the campaign did not run.',
  },
  meta_daily: {
    views: ['acquisition'],
    paths: { acquisition: ['daily'] },
    effectiveRangeKey: 'acquisition',
    definition: 'Meta CPM and outbound CTR diagnostics by reporting day.',
    dateBasis: 'Meta reporting date.',
    sources: ['meta'],
    totalSemantics: seriesView,
  },
  profit_efficiency: {
    views: ['acquisition'],
    paths: { acquisition: ['profitSeries'] },
    effectiveRangeKey: 'acquisition',
    definition: 'Observed and modeled Profit × without blending the two series.',
    dateBasis: 'Calculator accounting bucket over the shared acquisition range.',
    sources: ['orders', 'meta', 'assumptions'],
    totalSemantics: seriesView,
  },
  paid_funnel: {
    views: ['acquisition'],
    paths: { acquisition: ['funnel'] },
    effectiveRangeKey: 'acquisition',
    definition:
      'Separate Meta exposure, Bricomaitre demand, local posting, and EcoTrack paid stages.',
    dateBasis: 'Stage-specific date over the shared acquisition range.',
    sources: ['orders', 'ecotrack', 'meta'],
    totalSemantics: 'Stages are not interchangeable and later stages can be immature.',
    rowSemantics: {
      impressions: {
        definition: 'Impressions reported by Meta; not Bricomaitre orders.',
        dateBasis: 'Meta reporting date.',
        sources: ['meta'],
      },
      outboundClicks: {
        definition: 'Outbound clicks reported by Meta.',
        dateBasis: 'Meta reporting date.',
        sources: ['meta'],
      },
      landingViews: {
        definition: 'Landing-page views reported by Meta.',
        dateBasis: 'Meta reporting date.',
        sources: ['meta'],
      },
      bricOrders: {
        definition: 'Exactly captured Bricomaitre submitted orders; demand, not paid sales.',
        dateBasis: 'Captured order-attribution date.',
        sources: ['orders'],
        attribution:
          'Exact retained Meta attribution begins around 2026-08-10; immutable capture begins 2026-08-17.',
      },
      confirmed: {
        definition: 'Exactly attributed orders later confirmed locally; not shipped.',
        dateBasis: 'Captured order-attribution cohort with later local confirmation observed.',
        sources: ['orders'],
        attribution:
          'Exact retained Meta attribution begins around 2026-08-10; immutable capture begins 2026-08-17.',
      },
      posted: {
        definition: 'Exactly attributed orders later reaching their first local status 11.',
        dateBasis: 'Captured order-attribution cohort with later first-posted outcome observed.',
        sources: ['orders'],
        attribution:
          'Exact retained Meta attribution begins around 2026-08-10; immutable capture begins 2026-08-17.',
      },
      paid: {
        definition: 'Exactly attributed orders later reaching EcoTrack payed or paye_et_archive.',
        dateBasis: 'Captured order-attribution cohort with later paid outcome observed.',
        sources: ['orders', 'ecotrack'],
        maturity: 'Recent attributed cohorts can still be awaiting terminal outcomes.',
        attribution:
          'Exact retained Meta attribution begins around 2026-08-10; immutable capture begins 2026-08-17.',
      },
    },
  },
  tracking_events: {
    views: ['acquisition'],
    paths: { acquisition: ['trackingHealth', 'events'] },
    effectiveRangeKey: 'acquisition',
    definition: 'Captured Meta tracking-event diagnostics.',
    dateBasis: 'Meta reporting date.',
    sources: ['meta'],
    totalSemantics: rankedView,
  },
  shipment_states: {
    views: ['fulfillment'],
    paths: { fulfillment: ['states'] },
    effectiveRangeKey: 'fulfillment',
    definition:
      'Effective EcoTrack shipment states, including explicit untracked and stale filtering.',
    dateBasis: 'First-posted cohort observed through its latest usable EcoTrack state.',
    sources: ['orders', 'ecotrack'],
    totalSemantics: rankedView,
  },
  attempt_outcomes: {
    views: ['fulfillment'],
    paths: { fulfillment: ['attempts'] },
    effectiveRangeKey: 'fulfillment',
    definition: 'Recorded EcoTrack delivery-attempt telemetry grouped by outcome.',
    dateBasis: 'First-posted cohort with recorded attempt telemetry.',
    sources: ['orders', 'ecotrack'],
    totalSemantics:
      'Zero recorded attempts can mean missing provider telemetry; it does not prove no attempt occurred.',
  },
  fulfillment_trend: {
    views: ['fulfillment'],
    paths: { fulfillment: ['trend'] },
    effectiveRangeKey: 'fulfillment',
    definition: 'Shipment outcomes over time after effective-status filtering.',
    dateBasis: 'Canonical fulfillment event date declared by each field.',
    sources: ['orders', 'ecotrack'],
    totalSemantics: seriesView,
  },
  leading_forecast: {
    views: ['fulfillment'],
    paths: { fulfillment: ['leadingForecast', 'days'] },
    effectiveRangeKey: 'fulfillment',
    definition:
      'Known submitted and confirmed demand modeled to first posting, alongside paid outcomes modeled from recent recognition-day history.',
    dateBasis:
      'Future first-posted expectation date for pending demand and future EcoTrack recognition date for paid outcomes.',
    sources: ['orders', 'ecotrack', 'assumptions'],
    totalSemantics: 'Every row is modeled, not observed.',
  },
  storefront_trend: {
    views: ['storefront'],
    paths: { storefront: ['trend'] },
    effectiveRangeKey: 'storefront',
    definition:
      'Canonical Storefront session, view, checkout, and submitted-order trend over the retained first-party range.',
    dateBasis: 'First-party Storefront event and order-created dates over their shared range.',
    sources: ['orders', 'storefront'],
    totalSemantics: seriesView,
  },
  storefront_funnel: {
    views: ['storefront'],
    paths: { storefront: ['funnel'] },
    effectiveRangeKey: 'storefront_funnel',
    definition:
      'Distinct-session Storefront funnel from sessions through submitted-order sessions.',
    dateBasis: 'First-party Storefront session date over the retained detailed-telemetry range.',
    sources: ['orders', 'storefront'],
    totalSemantics:
      'Every stage counts distinct sessions, never raw events; submitted orders are demand, not paid sales.',
    rowSemantics: {
      Sessions: {
        definition: 'Distinct first-party Storefront sessions with a retained page visit.',
        dateBasis: 'First-party Storefront session date.',
        sources: ['storefront'],
      },
      'Product-view sessions': {
        definition: 'Distinct sessions that visited and viewed a product.',
        dateBasis: 'First-party Storefront session date.',
        sources: ['storefront'],
      },
      'Cart sessions': {
        definition: 'Distinct sessions that progressed through a product view and add-to-cart.',
        dateBasis: 'First-party Storefront session date.',
        sources: ['storefront'],
      },
      'Checkout sessions': {
        definition: 'Distinct sessions that progressed through cart and began checkout.',
        dateBasis: 'First-party Storefront session date.',
        sources: ['storefront'],
      },
      'Submitted-order sessions': {
        definition:
          'Distinct checkout sessions linked to a submitted local order; incoming demand, not paid sales.',
        dateBasis: 'Order-created and first-party session dates over their shared retained range.',
        sources: ['orders', 'storefront'],
      },
    },
  },
  storefront_paths: {
    views: ['storefront'],
    paths: { storefront: ['paths', 'rows'] },
    effectiveRangeKey: 'storefront',
    definition: 'Retained first-party Storefront navigation paths between canonical page groups.',
    dateBasis: 'First-party Storefront event date over the declared path-retention range.',
    sources: ['storefront'],
    totalSemantics:
      'Rows describe retained path telemetry only; unavailable long-range paths are not zero traffic.',
  },
  storefront_searches: {
    views: ['storefront'],
    paths: { storefront: ['searches'] },
    effectiveRangeKey: 'storefront',
    definition: 'Canonical onsite Storefront search demand.',
    dateBasis: 'First-party Storefront event date.',
    sources: ['storefront'],
    totalSemantics: rankedView,
  },
  storefront_products: {
    views: ['storefront'],
    paths: { storefront: ['productInterest'] },
    effectiveRangeKey: 'storefront',
    definition: 'Product-interest activity from first-party Storefront telemetry.',
    dateBasis: 'First-party Storefront event date.',
    sources: ['storefront'],
    totalSemantics: rankedView,
  },
  storefront_sources: {
    views: ['storefront'],
    paths: { storefront: ['acquisitionSources'] },
    effectiveRangeKey: 'storefront',
    definition: 'First-party Storefront session acquisition-source aggregates.',
    dateBasis: 'First-party Storefront session date.',
    sources: ['storefront'],
    totalSemantics: rankedView,
  },
  web_vitals: {
    views: ['storefront'],
    paths: { storefront: ['vitals'] },
    effectiveRangeKey: 'storefront',
    definition: 'Captured Storefront web-vital telemetry.',
    dateBasis: 'First-party Storefront event date.',
    sources: ['storefront'],
    totalSemantics: rankedView,
  },
  landing_pages: {
    views: ['storefront'],
    paths: { storefront: ['landingPages', 'pages'] },
    effectiveRangeKey: 'storefront',
    definition: 'Landing-page first-party demand and conversion decision view.',
    dateBasis: 'Order-created and Storefront session dates over their shared range.',
    sources: ['orders', 'storefront'],
    totalSemantics: rankedView,
  },
  storefront_assistant: {
    views: ['storefront'],
    paths: { storefront: ['aiAssistant'] },
    effectiveRangeKey: 'storefront',
    definition: 'Storefront assistant usage and influenced-order funnel.',
    dateBasis: 'First-party Storefront event and order-created dates.',
    sources: ['orders', 'storefront'],
    totalSemantics: 'One aggregate row; influenced orders are submitted demand, not paid sales.',
  },
  search_trend: {
    views: ['search'],
    paths: { search: ['trend'] },
    effectiveRangeKey: 'search',
    definition: 'Finalized Search Console clicks, impressions, CTR, and average position.',
    dateBasis: 'Search Console finalized reporting date.',
    sources: ['searchConsole'],
    totalSemantics: seriesView,
  },
  search_opportunities: {
    views: ['search'],
    paths: { search: ['opportunities'] },
    effectiveRangeKey: 'search',
    definition: 'Search queries ranked by non-causal visibility and CTR opportunity heuristics.',
    dateBasis: 'Search Console finalized reporting date.',
    sources: ['searchConsole'],
    totalSemantics: rankedView,
  },
  search_pages: {
    views: ['search'],
    paths: { search: ['pages'] },
    effectiveRangeKey: 'search',
    definition: 'Aggregate Search Console page visibility.',
    dateBasis: 'Search Console finalized reporting date.',
    sources: ['searchConsole'],
    totalSemantics: rankedView,
  },
  search_devices: {
    views: ['search'],
    paths: { search: ['devices'] },
    effectiveRangeKey: 'search',
    definition: 'Aggregate Search Console performance by device.',
    dateBasis: 'Search Console finalized reporting date.',
    sources: ['searchConsole'],
    totalSemantics: rankedView,
  },
  search_countries: {
    views: ['search'],
    paths: { search: ['countries'] },
    effectiveRangeKey: 'search',
    definition: 'Aggregate Search Console performance by country.',
    dateBasis: 'Search Console finalized reporting date.',
    sources: ['searchConsole'],
    totalSemantics: rankedView,
  },
  search_appearances: {
    views: ['search'],
    paths: { search: ['appearances'] },
    effectiveRangeKey: 'search',
    definition: 'Aggregate Search Console rich-result/search-appearance performance.',
    dateBasis: 'Search Console finalized reporting date.',
    sources: ['searchConsole'],
    totalSemantics: rankedView,
  },
  search_index_issues: {
    views: ['search'],
    paths: { search: ['indexHealth', 'issues'] },
    effectiveRangeKey: 'search',
    definition: 'Most recent Search Console URL-inspection issues.',
    dateBasis: 'Latest URL inspection timestamp, not the selected traffic period.',
    sources: ['searchConsole'],
    totalSemantics: rankedView,
  },
  search_sitemaps: {
    views: ['search'],
    paths: { search: ['indexHealth', 'sitemaps'] },
    effectiveRangeKey: 'search',
    definition: 'Most recent Search Console sitemap status.',
    dateBasis: 'Latest sitemap synchronization timestamp.',
    sources: ['searchConsole'],
    totalSemantics: rankedView,
  },
  products: {
    views: ['catalog'],
    paths: { catalog: ['products'] },
    effectiveRangeKey: 'catalog',
    additionalEffectiveRangeKeys: ['catalogStorefront'],
    definition:
      'Filtered product decision view combining first-posted units, paid outcomes, projected contribution, delivery speed, and available Storefront interest.',
    dateBasis: 'First-posted cohort; Storefront fields retain their separately declared range.',
    sources: ['orders', 'ecotrack', 'storefront', 'assumptions'],
    totalSemantics: rankedView,
  },
  basket_pairs: {
    views: ['catalog'],
    paths: { catalog: ['basketPairs'] },
    effectiveRangeKey: 'catalog',
    definition: 'Products co-occurring in submitted Bricomaitre order baskets.',
    dateBasis: 'Order-created date.',
    sources: ['orders'],
    totalSemantics: rankedView,
  },
  wilayas: {
    views: ['catalog'],
    paths: { catalog: ['geography', 'wilayas'] },
    effectiveRangeKey: 'catalog',
    definition: 'Customer operational outcomes across Algeria’s 58 wilayas.',
    dateBasis: 'First-posted cohort and actual elapsed calendar-time outcomes.',
    sources: ['orders', 'ecotrack'],
    totalSemantics: rankedView,
  },
  communes: {
    views: ['catalog'],
    paths: { catalog: ['geography', 'communes'] },
    effectiveRangeKey: 'catalog',
    definition: 'Customer operational outcomes by commune.',
    dateBasis: 'First-posted cohort and actual elapsed calendar-time outcomes.',
    sources: ['orders', 'ecotrack'],
    totalSemantics: rankedView,
  },
  meta_regions: {
    views: ['catalog'],
    paths: { catalog: ['geography', 'metaRegions'] },
    effectiveRangeKey: 'catalog',
    definition: 'Meta aggregate delivery-region diagnostics.',
    dateBasis: 'Meta reporting date.',
    sources: ['meta'],
    totalSemantics:
      'Meta regions are not customer wilayas and cannot be joined as customer identity.',
  },
  customers: {
    views: ['catalog'],
    paths: { catalog: ['customers', 'rows'] },
    effectiveRangeKey: 'catalog',
    definition:
      'Phone-normalized customer demand and paid contribution. Order value includes submitted demand; paid contribution includes only paid outcomes.',
    dateBasis: 'Order-created customer cohort date.',
    sources: ['orders', 'ecotrack', 'meta', 'assumptions'],
    totalSemantics: rankedView,
  },
  operating_costs: {
    views: ['assumptions'],
    paths: { assumptions: ['costs'] },
    effectiveRangeKey: 'assumptions',
    definition: 'Manually configured operating-cost records and their effective periods.',
    dateBasis: 'Configured cost start/end dates.',
    sources: ['assumptions'],
    totalSemantics: rankedView,
  },
  daily_assumptions: {
    views: ['assumptions'],
    paths: { assumptions: ['days'] },
    effectiveRangeKey: 'assumptions',
    definition: 'Daily calculator inputs, source overrides, and resolved assumptions.',
    dateBasis: 'Calculator accounting date.',
    sources: ['orders', 'meta', 'assumptions'],
    totalSemantics: seriesView,
  },
};

export function adminAiAnalyticsFocusSchemaForView(view: Analytics2View) {
  const dimensions = adminAiAnalyticsFocusDimensions.filter((dimension) =>
    adminAiAnalyticsDatasetSpecs[dimension].views.includes(view),
  );
  const selectorDimensions = dimensions.filter((dimension) =>
    adminAiAnalyticsSelectorDimensions.has(dimension),
  );
  const fixedDimensions = dimensions.filter(
    (dimension) => !adminAiAnalyticsSelectorDimensions.has(dimension),
  );
  const selectorSchema = selectorDimensions.length
    ? z
        .object({
          dimension: z.enum(
            selectorDimensions as [
              AdminAiAnalyticsFocusDimension,
              ...AdminAiAnalyticsFocusDimension[],
            ],
          ),
          search: z.string().trim().min(1).max(200).optional(),
          identifiers: z.array(z.string().trim().min(1).max(200)).max(100).default([]),
          limit: adminAiAnalyticsFocusLimitSchema,
        })
        .strict()
    : null;
  const fixedSchema = fixedDimensions.length
    ? z
        .object({
          dimension: z.enum(
            fixedDimensions as [
              AdminAiAnalyticsFocusDimension,
              ...AdminAiAnalyticsFocusDimension[],
            ],
          ),
          search: z.never().optional(),
          identifiers: z.array(z.never()).max(0).optional(),
          limit: adminAiAnalyticsFocusLimitSchema,
        })
        .strict()
    : null;

  if (selectorSchema && fixedSchema) return z.union([selectorSchema, fixedSchema]);
  if (selectorSchema) return selectorSchema;
  if (fixedSchema) return fixedSchema;
  throw new Error(`Analytics view ${view} has no focused datasets.`);
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function valueAtPath(value: unknown, path: string[]) {
  let current = value;
  for (const key of path) current = record(current)?.[key];
  return current;
}

function rowsAtPath(value: unknown, path: string[]) {
  const found = valueAtPath(value, path);
  if (Array.isArray(found)) return found;
  return found == null ? [] : [found];
}

function normalized(value: unknown) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase();
}

function scalarValues(value: unknown, depth = 0, includeNumbers = false): string[] {
  if (depth > 4 || value == null) return [];
  if (
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (includeNumbers && typeof value === 'number')
  ) {
    return [normalized(value)];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => scalarValues(item, depth + 1, includeNumbers));
  }
  return record(value)
    ? Object.values(value as Record<string, unknown>).flatMap((item) =>
        scalarValues(item, depth + 1, includeNumbers),
      )
    : [];
}

function matchesFocus(row: unknown, focus: AdminAiAnalyticsFocus) {
  const values = scalarValues(row);
  const terms = focus.search ? normalized(focus.search).split(/\s+/u).filter(Boolean) : [];
  if (terms.length && !terms.every((term) => values.some((value) => value.includes(term)))) {
    return false;
  }
  if (focus.identifiers.length) {
    const identifierValues = scalarValues(row, 0, true);
    const identifiers = focus.identifiers.map(normalized);
    if (!identifiers.some((identifier) => identifierValues.includes(identifier))) return false;
  }
  return true;
}

function effectiveRange(payload: Analytics2Payload, key: string): Analytics2EffectiveRange {
  return (
    payload.effectiveRanges.find((range) => range.key === key) ?? {
      key: 'requested',
      startDate: payload.filters.startDate,
      endDate: payload.filters.endDate,
      sources: [],
    }
  );
}

export function validateAdminAiAnalyticsFocus(
  view: Analytics2View,
  focus: AdminAiAnalyticsFocus | undefined,
) {
  if (!focus) return null;
  const spec = adminAiAnalyticsDatasetSpecs[focus.dimension];
  return spec.views.includes(view)
    ? null
    : `${focus.dimension} is available in ${spec.views.join(', ')}, not ${view}.`;
}

export function focusAnalytics2ForAssistant(
  payload: Analytics2Payload,
  focus: AdminAiAnalyticsFocus,
) {
  const spec = adminAiAnalyticsDatasetSpecs[focus.dimension];
  const path = spec.paths[payload.view] ?? [];
  const availableRows = rowsAtPath(payload.data, path);
  const matchedRows = availableRows.filter((row) => matchesFocus(row, focus));
  const rows = matchedRows.slice(0, focus.limit);
  const relatedPath = spec.relatedPaths?.[payload.view] ?? null;
  const availableRelatedRows = relatedPath ? rowsAtPath(payload.data, relatedPath) : [];
  const matchedRelatedRows = availableRelatedRows.filter((row) => matchesFocus(row, focus));
  const relatedRows = matchedRelatedRows.slice(0, focus.limit);
  const range = effectiveRange(payload, spec.effectiveRangeKey);
  const additionalRanges = (spec.additionalEffectiveRangeKeys ?? []).map((key) =>
    effectiveRange(payload, key),
  );
  const rowContract = [
    ...new Set(
      rows.flatMap((row) => {
        const value = record(row);
        const key = value?.key ?? value?.name;
        return typeof key === 'string' ? [key] : [];
      }),
    ),
  ].flatMap((key) => {
    const semantics = spec.rowSemantics?.[key];
    return semantics ? [{ key, ...semantics }] : [];
  });
  return {
    dimension: focus.dimension,
    definition: spec.definition,
    sources: spec.sources,
    requestedRange: {
      startDate: payload.filters.startDate,
      endDate: payload.filters.endDate,
    },
    effectiveRange: { startDate: range.startDate, endDate: range.endDate },
    effectiveRanges: [range, ...additionalRanges].map((item) => ({
      key: item.key,
      startDate: item.startDate,
      endDate: item.endDate,
      sources: item.sources,
    })),
    dateBasis: spec.dateBasis,
    totalSemantics: spec.totalSemantics,
    fieldContract: fieldContracts(rows, spec, focus.dimension),
    rowContract,
    canonicalPath: path.join('.'),
    search: focus.search ?? null,
    identifiers: focus.identifiers,
    available: availableRows.length,
    matched: matchedRows.length,
    included: rows.length,
    truncated: matchedRows.length > rows.length,
    warning:
      matchedRows.length === 0
        ? 'No row matched in this canonical ranked/filtered decision view. This does not establish that the entity is absent from the underlying business.'
        : null,
    rows,
    related:
      relatedPath && spec.relatedDefinition
        ? {
            definition: spec.relatedDefinition,
            fieldContract: fieldContracts(relatedRows, spec, focus.dimension),
            canonicalPath: relatedPath.join('.'),
            available: availableRelatedRows.length,
            matched: matchedRelatedRows.length,
            included: relatedRows.length,
            truncated: matchedRelatedRows.length > relatedRows.length,
            rows: relatedRows,
          }
        : null,
  };
}
