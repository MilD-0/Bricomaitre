import type { AnalyticsMetric, AnalyticsSource, AnalyticsView } from '../analytics';

export type MetricDefinition = {
  definition: string;
  sources: AnalyticsSource['key'][];
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
  offPipelineSales:
    'Completed sales outside Bricomaitre Orders, Posting, and Shipments. They add only their exact collected cash, fees, product cost, net revenue, and realized profit; they never add operational, inventory, customer, fulfilment, return, acquisition, or conversion activity.',
  profitX: 'Adjusted profit divided by Meta ad cost; unavailable when ad cost is zero.',
  formulas: [
    'ad cost DZD = Meta spend EUR × snapshotted manual FX rate',
    'adjusted profit = realized gross profit + unresolved/shipping gross profit × (1 − planning return rate ÷ 100)',
    'net profit = adjusted profit − Meta ad cost',
    'Profit × = adjusted profit ÷ Meta ad cost',
    'true profit = net profit − configured operating costs',
  ],
} as const;

export type AdminAiAnalyticsMetric = AnalyticsMetric & {
  name: string;
  definition: string;
  sources: AnalyticsSource['key'][];
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

const viewOverrides: Partial<Record<`${AnalyticsView}.${string}`, Partial<MetricDefinition>>> = {
  'acquisition.adCost': {
    dateBasis: 'Meta reporting date.',
  },
  'money.adCost': {
    dateBasis:
      'Actual Meta reporting date in the headline total; calculator series may roll Friday spend to the next working day.',
  },
};

export function definitionFor(view: AnalyticsView, key: string): MetricDefinition {
  const shared = sharedMetricDefinitions[key] ?? {
    definition: `Canonical ${key} metric from the ${view} Analytics workspace.`,
    sources: [],
    dateBasis: 'The date basis declared by the owning Analytics workspace.',
  };
  return { ...shared, ...viewOverrides[`${view}.${key}`] };
}
