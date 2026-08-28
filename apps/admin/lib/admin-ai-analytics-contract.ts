import { ANALYTICS2_FACT_SEMANTICS_VERSION } from './analytics2-fact-contract';
import type {
  Analytics2EffectiveRange,
  Analytics2Metric,
  Analytics2Payload,
  Analytics2Source,
  Analytics2View,
} from './analytics2';

type MetricDefinition = {
  definition: string;
  sources: Analytics2Source['key'][];
  dateBasis: string;
  assumptions?: string[];
  maturity?: string;
  comparison?: 'period' | 'not_applicable';
};

/**
 * One canonical explanation of the profit model. Metric enrichment, live tool
 * results, and conceptual system-knowledge answers all reuse this object so a
 * response cannot receive two different adjusted-profit formulas.
 */
export const ADMIN_AI_ANALYTICS_PROFIT_KNOWLEDGE = {
  grossProfit: 'Order value minus product cost before return assumptions and advertising.',
  adjustedProfit:
    'Realized gross profit plus unresolved/shipping gross profit after applying the manual planning return rate only to that unresolved/shipping portion.',
  netProfit: 'Adjusted profit minus Meta ad cost.',
  trueProfit: 'Net profit minus configured operating costs.',
  unresolvedContribution:
    'Gross contribution from orders that reached local posted status 11 but have neither a recognized successful outcome nor a recognized unsuccessful outcome. This includes active carrier states, untracked posted orders, and other pending posted outcomes. Delivered, payed, paye_et_archive, and manually completed orders are realized; archived returns, cancelled orders, and failed orders contribute zero. Orders that never reached posted status 11 do not enter this calculation.',
  projectedContribution:
    'State-aware expected contribution: delivered and paid contribution is retained, known unsuccessful outcomes contribute zero, and only unresolved posted demand uses the planning return rate.',
  deliveredContribution: 'Contribution attached to delivered orders; not received cash.',
  automaticPaidContribution:
    'EcoTrack COD minus estimated tariff and product cost for payed/paye_et_archive outcomes.',
  paidTrueProfit:
    'Paid contribution minus comparable Meta and operating costs; do not call raw paid contribution whole-business profit.',
  profitX: 'Adjusted profit divided by Meta ad cost; unavailable when ad cost is zero.',
  formulas: [
    'ad cost DZD = Meta spend EUR × snapshotted manual FX rate',
    'adjusted profit = realized gross profit + unresolved/shipping gross profit × (1 − planning return rate ÷ 100)',
    'net profit = adjusted profit − Meta ad cost',
    'Profit × = adjusted profit ÷ Meta ad cost',
    'true profit = net profit − configured operating costs',
  ],
} as const;

export type AdminAiAnalyticsMetric = Analytics2Metric & {
  name: string;
  definition: string;
  sources: Analytics2Source['key'][];
  requestedRange: { startDate: string | null; endDate: string };
  effectiveRange: { startDate: string | null; endDate: string };
  dateBasis: string;
  asOf: string | null;
  coveragePct: number | null;
  maturity: string;
  assumptions: string[];
  attributionCoveragePct: number | null;
  comparisonStatus: 'comparable' | 'unavailable' | 'not_applicable';
  comparisonReason: string;
  warning: string | null;
};

const sharedMetricDefinitions: Record<string, MetricDefinition> = {
  trueProfit: {
    definition: `${ADMIN_AI_ANALYTICS_PROFIT_KNOWLEDGE.trueProfit} It is planning-based whole-business profit, not paid cash.`,
    sources: ['orders', 'meta', 'assumptions'],
    dateBasis: 'Calculator accounting date, led by first-posted order dates.',
    assumptions: ['Manual planning return rate', 'Snapshotted manual DZD/EUR FX rate'],
  },
  profitX: {
    definition: ADMIN_AI_ANALYTICS_PROFIT_KNOWLEDGE.profitX,
    sources: ['orders', 'meta', 'assumptions'],
    dateBasis: 'Calculator accounting date, led by first-posted order dates.',
    assumptions: ['Manual planning return rate', 'Snapshotted manual DZD/EUR FX rate'],
  },
  adjustedProfit: {
    definition: ADMIN_AI_ANALYTICS_PROFIT_KNOWLEDGE.adjustedProfit,
    sources: ['orders', 'assumptions'],
    dateBasis: 'First-posted date / calculator accounting date.',
    assumptions: ['Manual planning return rate'],
  },
  grossProfit: {
    definition: ADMIN_AI_ANALYTICS_PROFIT_KNOWLEDGE.grossProfit,
    sources: ['orders'],
    dateBasis: 'First-posted date / calculator accounting date.',
  },
  automaticPaidProfit: {
    definition:
      'EcoTrack COD minus estimated EcoTrack tariff and product cost for payed and paye_et_archive outcomes. It is paid contribution, not whole-business profit.',
    sources: ['orders', 'ecotrack'],
    dateBasis: 'EcoTrack paid/archive recognition date.',
    maturity: 'Recognized paid outcomes only; active and unresolved shipments are excluded.',
  },
  paidProfitCoverage: {
    definition: 'Share of paid outcomes whose contribution uses an exact purchase-cost snapshot.',
    sources: ['orders', 'ecotrack'],
    dateBasis: 'EcoTrack paid/archive recognition date.',
    maturity: 'Recognized paid outcomes only.',
  },
  adCost: {
    definition: 'Meta spend in EUR converted to DZD with the snapshotted manual FX rate.',
    sources: ['meta', 'assumptions'],
    dateBasis: 'Meta reporting date unless the view explicitly uses calculator accounting.',
    assumptions: ['Snapshotted manual DZD/EUR FX rate'],
  },
  postedOrders: {
    definition: 'Orders on their first transition to local status 11.',
    sources: ['orders'],
    dateBasis: 'First-posted date.',
  },
  paidOrders: {
    definition: 'EcoTrack outcomes in payed or paye_et_archive state.',
    sources: ['orders', 'ecotrack'],
    dateBasis: 'EcoTrack paid/archive recognition date.',
    maturity: 'Recognized paid outcomes; recent posting cohorts can still be immature.',
  },
  costPerPosted: {
    definition: 'Comparable Meta ad cost divided by first-posted orders.',
    sources: ['orders', 'meta', 'assumptions'],
    dateBasis: 'Shared Meta-reporting and first-posted effective range.',
  },
  costPerDelivered: {
    definition:
      'Comparable Meta ad cost divided by EcoTrack-delivered, exactly attributed Bricomaitre orders.',
    sources: ['orders', 'ecotrack', 'meta'],
    dateBasis: 'Shared attribution-spend range with delivery outcomes.',
    maturity: 'Recent attributed orders can still be awaiting delivery.',
  },
  storefrontConversion: {
    definition:
      'Submitted local storefront orders divided by canonical first-party Storefront sessions.',
    sources: ['orders', 'storefront'],
    dateBasis: 'Order-created and first-party session dates over their shared effective range.',
  },
  sessions: {
    definition: 'Distinct canonical first-party Storefront sessions.',
    sources: ['storefront'],
    dateBasis: 'First-party Storefront session date.',
  },
  engagementRate: {
    definition: 'Share of retained raw-event sessions that meet the Storefront engagement rule.',
    sources: ['storefront'],
    dateBasis: 'First-party Storefront event date.',
  },
  purchases: {
    definition: 'Submitted local storefront orders. These are incoming orders, not paid sales.',
    sources: ['orders', 'storefront'],
    dateBasis: 'Order-created date.',
  },
  conversionRate: {
    definition:
      'Submitted local storefront orders divided by canonical first-party Storefront sessions.',
    sources: ['orders', 'storefront'],
    dateBasis: 'Order-created and first-party session dates over their shared effective range.',
  },
  errorRate: {
    definition: 'Share of retained raw-event Storefront sessions with a captured error event.',
    sources: ['storefront'],
    dateBasis: 'First-party Storefront event date.',
  },
  returningJourneys: {
    definition: 'Retained first-party Storefront journeys that return after an earlier visit.',
    sources: ['storefront'],
    dateBasis: 'First-party Storefront event date.',
  },
  impressions: {
    definition: 'Impressions reported by Meta Ads.',
    sources: ['meta'],
    dateBasis: 'Meta reporting date.',
  },
  outboundClicks: {
    definition: 'Outbound clicks reported by Meta Ads.',
    sources: ['meta'],
    dateBasis: 'Meta reporting date.',
  },
  activeShipments: {
    definition:
      'Active EcoTrack shipments after effective-status filtering; stale ready-to-ship orders are not kept active forever.',
    sources: ['orders', 'ecotrack'],
    dateBasis: 'First-posted cohort observed through the current EcoTrack state.',
    maturity: 'Open operational population, not a terminal cohort.',
  },
  postedUnits: {
    definition: 'Order-line units attached to first-posted orders.',
    sources: ['orders'],
    dateBasis: 'First-posted date.',
  },
  paidUnits: {
    definition: 'Order-line units attached to EcoTrack payed or paye_et_archive outcomes.',
    sources: ['orders', 'ecotrack'],
    dateBasis: 'Original first-posted cohort with paid outcome observed through the range.',
    maturity: 'Recent posting cohorts can still be immature.',
  },
  customers: {
    definition:
      'Distinct customers normalized primarily by phone, including submitted demand in order value.',
    sources: ['orders'],
    dateBasis: 'Order-created date.',
  },
  repeatRate: {
    definition: 'Share of phone-normalized customers with more than one submitted order.',
    sources: ['orders'],
    dateBasis: 'Order-created cohort date.',
    maturity: 'Recent customer cohorts have had less time to repeat.',
  },
  activeMonthlyBurn: {
    definition: 'Sum of active manually configured monthly operating costs.',
    sources: ['assumptions'],
    dateBasis: 'Operating-cost effective dates.',
    comparison: 'not_applicable',
  },
  periodOperatingCost: {
    definition: 'Operating costs allocated to the selected calculator accounting period.',
    sources: ['assumptions'],
    dateBasis: 'Calculator accounting date.',
    comparison: 'not_applicable',
  },
  manualOverrideDays: {
    definition: 'Days in the range with a manual calculator source override.',
    sources: ['assumptions'],
    dateBasis: 'Calculator accounting date.',
    comparison: 'not_applicable',
  },
  projectedCoverage: {
    definition: 'Share of projected economics backed by exact immutable purchase-cost snapshots.',
    sources: ['orders', 'assumptions'],
    dateBasis: 'First-posted date / calculator accounting date.',
    comparison: 'not_applicable',
  },
  searchClicks: {
    definition: 'Finalized organic Google Search clicks reported by Search Console.',
    sources: ['searchConsole'],
    dateBasis: 'Search Console finalized reporting date.',
  },
  searchImpressions: {
    definition: 'Finalized organic Google Search impressions reported by Search Console.',
    sources: ['searchConsole'],
    dateBasis: 'Search Console finalized reporting date.',
  },
  searchCtr: {
    definition: 'Finalized Search Console clicks divided by impressions.',
    sources: ['searchConsole'],
    dateBasis: 'Search Console finalized reporting date.',
  },
  averagePosition: {
    definition:
      'Impression-weighted average Google Search position. A lower position number is better.',
    sources: ['searchConsole'],
    dateBasis: 'Search Console finalized reporting date.',
  },
};

const viewOverrides: Partial<Record<`${Analytics2View}.${string}`, Partial<MetricDefinition>>> = {
  'acquisition.adCost': {
    dateBasis: 'Meta reporting date.',
  },
  'money.adCost': {
    dateBasis:
      'Actual Meta reporting date in the headline total; calculator series may roll Friday spend to the next working day.',
  },
};

function definitionFor(view: Analytics2View, key: string): MetricDefinition {
  const shared = sharedMetricDefinitions[key] ?? {
    definition: `Canonical ${key} metric from the ${view} Analytics workspace.`,
    sources: [],
    dateBasis: 'The date basis declared by the owning Analytics workspace.',
  };
  return { ...shared, ...viewOverrides[`${view}.${key}`] };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function numberAt(value: unknown, path: string[]): number | null {
  let current = value;
  for (const key of path) current = record(current)?.[key];
  return typeof current === 'number' && Number.isFinite(current) ? current : null;
}

function relevantRange(view: Analytics2View, key: string) {
  if (view === 'command') {
    if (key === 'storefrontConversion') return 'storefront';
    if (key === 'automaticPaidProfit' || key === 'postedOrders' || key === 'paidOrders') {
      return 'fulfillment';
    }
    return 'economics';
  }
  if (view === 'money')
    return key.startsWith('automaticPaid') || key === 'paidProfitCoverage' ? 'paid' : 'economics';
  if (view === 'acquisition') return 'acquisition';
  if (view === 'fulfillment') return 'fulfillment';
  if (view === 'storefront') return 'storefront';
  if (view === 'search') return 'search';
  if (view === 'catalog') return 'catalog';
  return 'assumptions';
}

function sourceAsOf(payload: Analytics2Payload, keys: Analytics2Source['key'][]) {
  const dates = payload.sources
    .filter((source) => keys.includes(source.key) && source.throughDate)
    .map((source) => source.throughDate as string)
    .sort();
  return dates.at(0) ?? null;
}

function sourceWarning(payload: Analytics2Payload, keys: Analytics2Source['key'][]) {
  const source = payload.sources.find(
    (item) =>
      keys.includes(item.key) &&
      (item.state === 'missing' || item.state === 'partial' || item.state === 'lagged'),
  );
  return source
    ? `${source.key} is ${source.state}; values beyond its covered period are unavailable, not zero.`
    : null;
}

function exactCostCoverage(payload: Analytics2Payload, key: string) {
  if (key === 'projectedCoverage') {
    const metric = record(payload.data)?.metrics;
    const rows = Array.isArray(metric) ? metric : [];
    const row = rows.find((item) => record(item)?.key === key);
    const value = record(row)?.value;
    return typeof value === 'number' ? value : null;
  }
  if (key === 'automaticPaidProfit' || key === 'paidProfitCoverage') {
    return (
      numberAt(payload.data, ['automaticPaid', 'summary', 'profitCoveragePct']) ??
      numberAt(payload.data, ['economics', 'automaticPaid', 'summary', 'profitCoveragePct'])
    );
  }
  if (['trueProfit', 'profitX', 'adjustedProfit', 'grossProfit'].includes(key)) {
    const paths: Partial<Record<Analytics2View, string[]>> = {
      command: ['economics', 'coverage', 'projectedCoveragePct'],
      money: ['coverage', 'projectedCoveragePct'],
      acquisition: ['coverage', 'projectedCoveragePct'],
      catalog: ['coverage', 'projectedCoveragePct'],
    };
    const path = paths[payload.view];
    return path ? numberAt(payload.data, path) : null;
  }
  return null;
}

function attributionCoverage(payload: Analytics2Payload, key: string) {
  if (
    payload.view !== 'acquisition' ||
    !['postedOrders', 'costPerPosted', 'costPerDelivered'].includes(key)
  ) {
    return null;
  }
  return numberAt(payload.data, ['efficiency', 'exactAdAttributionCoveragePct']);
}

function metricWarning(
  payload: Analytics2Payload,
  metric: Analytics2Metric,
  definition: MetricDefinition,
  coveragePct: number | null,
) {
  if (metric.key === 'profitX' && metric.value == null) {
    const metrics = record(payload.data)?.metrics;
    const adCost = Array.isArray(metrics)
      ? metrics.find((value) => record(value)?.key === 'adCost')
      : null;
    if (record(adCost)?.value === 0) {
      return 'Unavailable because comparable Meta ad cost is zero; Profit × is neither zero nor infinity.';
    }
  }
  if (metric.value == null)
    return 'Unavailable for this effective range; do not interpret it as zero.';
  if (coveragePct != null && coveragePct < 95) {
    return `Exact purchase-cost coverage is ${coveragePct.toFixed(1)}%; uncovered economics use the canonical 30% estimated margin.`;
  }
  return sourceWarning(payload, definition.sources);
}

function metricComparison(
  payload: Analytics2Payload,
  metric: Analytics2Metric,
  definition: MetricDefinition,
): Pick<AdminAiAnalyticsMetric, 'comparisonStatus' | 'comparisonReason'> {
  if (metric.previous != null) {
    return {
      comparisonStatus: 'comparable',
      comparisonReason: 'Matched prior-period value is available over canonical source coverage.',
    };
  }
  if (definition.comparison === 'not_applicable') {
    return {
      comparisonStatus: 'not_applicable',
      comparisonReason: 'This metric is presented as current configuration or coverage evidence.',
    };
  }
  if (!payload.filters.comparisonStartDate || !payload.filters.comparisonEndDate) {
    return {
      comparisonStatus: 'not_applicable',
      comparisonReason: 'The requested range has no matched prior-period window.',
    };
  }
  return {
    comparisonStatus: 'unavailable',
    comparisonReason:
      'No comparable prior value is available; this can reflect source coverage, an unavailable denominator, or no prior population and must not be read as zero.',
  };
}

function effectiveRangeFor(
  payload: Analytics2Payload,
  metric: Analytics2Metric,
): Analytics2EffectiveRange {
  return (
    payload.effectiveRanges.find(
      (range) => range.key === relevantRange(payload.view, metric.key),
    ) ?? {
      key: 'requested',
      startDate: payload.filters.startDate,
      endDate: payload.filters.endDate,
      sources: [],
    }
  );
}

export function analyticsMetricsForAssistant(payload: Analytics2Payload): AdminAiAnalyticsMetric[] {
  const metrics = record(payload.data)?.metrics;
  if (!Array.isArray(metrics)) return [];
  return metrics.flatMap((value) => {
    const metric = record(value) as Analytics2Metric | null;
    if (!metric || typeof metric.key !== 'string') return [];
    const definition = definitionFor(payload.view, metric.key);
    const effectiveRange = effectiveRangeFor(payload, metric);
    const coveragePct = exactCostCoverage(payload, metric.key);
    const usesFallbackCost = coveragePct != null && coveragePct < 100;
    const attributionCoveragePct = attributionCoverage(payload, metric.key);
    const comparison = metricComparison(payload, metric, definition);
    return [
      {
        ...metric,
        name: metric.key,
        definition: definition.definition,
        sources: definition.sources,
        requestedRange: {
          startDate: payload.filters.startDate,
          endDate: payload.filters.endDate,
        },
        effectiveRange: {
          startDate: effectiveRange.startDate,
          endDate: effectiveRange.endDate,
        },
        dateBasis: definition.dateBasis,
        asOf: sourceAsOf(payload, definition.sources),
        coveragePct,
        maturity: definition.maturity ?? 'Observed over the declared effective range.',
        assumptions: [
          ...(definition.assumptions ?? []),
          ...(usesFallbackCost ? ['30% fallback margin for missing immutable purchase costs'] : []),
        ],
        attributionCoveragePct,
        ...comparison,
        warning: metricWarning(payload, metric, definition, coveragePct),
      },
    ];
  });
}

export const ADMIN_AI_ANALYTICS_SEMANTIC_CONTRACT = {
  semanticsVersion: ANALYTICS2_FACT_SEMANTICS_VERSION,
  timezone: 'Africa/Algiers',
  lifecycle: {
    submitted: 'Incoming storefront order; never call it a completed sale or revenue.',
    confirmed: 'Approved locally; not shipped.',
    posted: 'First local status 11; begins shipment economics.',
    inTransit: 'Active EcoTrack shipment after effective-status filtering.',
    delivered: 'EcoTrack delivery; not proof that COD was received.',
    payed:
      'EcoTrack recognized paid outcome used by Analytics; it is settlement evidence, not bank-account reconciliation.',
    payeEtArchive:
      'Later EcoTrack paid processing/archive outcome; payed remains an equally valid paid outcome.',
    returned: 'Historical terminal outcome; never silently changes the planning return rate.',
    failed:
      'Local failure or prete_a_expedier with no progress for seven days; excluded from active shipment and cash totals.',
    untracked: 'Posted locally with no usable EcoTrack state; qualify it as untracked.',
    deliveryAttempts:
      'A delivered order with zero recorded attempts means attempt telemetry is absent, not necessarily that no attempt happened.',
  },
  profit: ADMIN_AI_ANALYTICS_PROFIT_KNOWLEDGE,
  returnPolicy: {
    planning:
      'Manual rate used only for unresolved demand; exactly 100% is the operator profit-suppression mode.',
    observed:
      'Returned divided by paid plus returned in a mature terminal cohort; excludes active, unresolved, failed, and cancelled orders.',
    adoption:
      'Observed returns are descriptive evidence with sample size and maturity. They change planning only through an explicit user action.',
  },
  missingCosts:
    'Prefer immutable line-item purchase-cost snapshots. Uncovered economics use a 30% estimated margin while exact-cost coverage remains separate. Coverage of at least 95% is not itself a warning.',
  dateBases:
    'Demand uses order-created date; projected economics first-posted/calculator date; delivery the delivery event; maturity the original posting cohort; paid economics paid/archive recognition; Meta its reporting date; Search Console its finalized date. Historical Storefront rollups have a UTC-day boundary limitation near midnight.',
  fridayAccounting:
    'After activation, a Friday with no automatic or manual gross-profit/confirmed activity is a rest day. Actual Meta spend stays on Friday but calculator economics roll it to the next working day. Friday-start weekly totals stay invariant; a trailing Friday may remain pending. Missing order data is never a rest day. No real event timestamp is rewritten.',
  projection:
    'Forecasts use the stronger of a weekday-weighted completed-day baseline and known pending demand, with confidence, historical conversion/delay, planning returns, and fallback cost. They do not blindly add baseline and pipeline. Stale pending demand is capped at seven days. Dotted values are modeled; solid values are observed.',
  sourcePrecedence: {
    demand: 'Bricomaitre orders and immutable lines',
    posting: 'Local status history',
    shipmentAndCod: 'EcoTrack',
    assumptions: 'Manual planning settings',
    ads: 'meta_ads_daily_insights',
    storefront: 'First-party Storefront telemetry',
    organicSearch: 'Search Console',
    spreadsheets: 'Optional historical audit only; never current Meta truth',
  },
  availability:
    'Cross-source claims use the shared effective period. Missing tails, nulls, em dashes, immature cohorts, and unavailable comparisons are never zero. Never compare a complete period with a partial period.',
  storefront:
    'Conversion is submitted local orders divided by canonical first-party sessions. The funnel is distinct sessions → product-view sessions → cart sessions → checkout sessions → submitted-order sessions, never raw event counts.',
  metaAttribution:
    'Keep Meta-reported purchases separate from Bricomaitre orders. Exact retained entity attribution starts around 2026-08-10 and immutable capture on 2026-08-17. Never fabricate earlier attribution. Spend coverage can exceed attributed-order coverage. Creative metrics are diagnostic correlations, not causal proof.',
  interpretation:
    'Customer identity is normalized primarily by phone. Product scatter and tables are filtered decision views; use headline aggregates for totals. Delivery speed is elapsed calendar time. Meta regions and customer wilayas are separate aggregates. Search Console is aggregate and row-limited, lower average position is better, and it does not provide deterministic order attribution. GA4 is not canonical or required.',
  materializedFacts:
    'Facts are a performance cache, not alternative semantics. Use requires a complete date spine, semantics version 5, fresh dependencies and assumptions, and no unresolved Friday roll-forward; otherwise canonical tables are computed live.',
} as const;
