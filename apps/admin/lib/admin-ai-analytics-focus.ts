import { z } from 'zod';

import type {
  Analytics2EffectiveRange,
  Analytics2Payload,
  Analytics2Source,
  Analytics2View,
} from './analytics2';

export const adminAiAnalyticsFocusDimensions = [
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

export const adminAiAnalyticsFocusSchema = z
  .object({
    dimension: z
      .enum(adminAiAnalyticsFocusDimensions)
      .describe(
        'Select the exact dataset named by the question. Money: economics_timeline, paid_timeline, forecast, posting_cohorts, friday_weeks. Acquisition: campaigns, adsets, ads, attribution_maturation, meta_daily, profit_efficiency, paid_funnel, tracking_events. Fulfillment: cash_pipeline, posting_cohorts, shipment_states, attempt_outcomes, fulfillment_trend, leading_forecast. Storefront: storefront_searches, storefront_products, storefront_sources, web_vitals, landing_pages, storefront_assistant. Search Console: search_trend, search_opportunities, search_pages, search_devices, search_countries, search_appearances, search_index_issues, search_sitemaps. Catalog: products, basket_pairs, wilayas, communes, meta_regions, customers. Assumptions: operating_costs, daily_assumptions. Command: economics_timeline, cash_pipeline, forecast, signals.',
      ),
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
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(20)
      .describe('Maximum matched rows to return; increase only when the question needs more rows.'),
  })
  .strict();

export type AdminAiAnalyticsFocus = z.infer<typeof adminAiAnalyticsFocusSchema>;

type DatasetSpec = {
  views: Analytics2View[];
  paths: Partial<Record<Analytics2View, string[]>>;
  effectiveRangeKey: string;
  additionalEffectiveRangeKeys?: string[];
  definition: string;
  dateBasis: string;
  sources: Analytics2Source['key'][];
  totalSemantics: string;
};

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
  },
  forecast: {
    views: ['command', 'money'],
    paths: { command: ['forecast', 'days'], money: ['forecast'] },
    effectiveRangeKey: 'economics',
    definition:
      'Modeled future completion from the stronger weekday baseline or pending-demand pipeline expectation.',
    dateBasis: 'Future calculator accounting date.',
    sources: ['orders', 'meta', 'assumptions'],
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
  },
  adsets: {
    views: ['acquisition'],
    paths: { acquisition: ['entities', 'adsets'] },
    effectiveRangeKey: 'acquisition',
    definition: 'Meta ad-set performance joined only to exactly attributed Bricomaitre outcomes.',
    dateBasis: 'Shared Meta spend and captured order-attribution range.',
    sources: ['orders', 'ecotrack', 'meta'],
    totalSemantics: rankedView,
  },
  ads: {
    views: ['acquisition'],
    paths: { acquisition: ['entities', 'ads'] },
    effectiveRangeKey: 'acquisition',
    definition: 'Meta ad performance joined only to exactly attributed Bricomaitre outcomes.',
    dateBasis: 'Shared Meta spend and captured order-attribution range.',
    sources: ['orders', 'ecotrack', 'meta'],
    totalSemantics: rankedView,
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
    definition: 'Modeled conversion and delay of known submitted and confirmed demand.',
    dateBasis: 'Future first-posted expectation date.',
    sources: ['orders', 'assumptions'],
    totalSemantics: 'Every row is modeled, not observed.',
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
  const range = effectiveRange(payload, spec.effectiveRangeKey);
  const additionalRanges = (spec.additionalEffectiveRangeKeys ?? []).map((key) =>
    effectiveRange(payload, key),
  );
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
  };
}
