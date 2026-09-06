import { z } from 'zod';

const analyticsViews = [
  'command',
  'money',
  'acquisition',
  'fulfillment',
  'storefront',
  'search',
  'catalog',
  'assumptions',
] as const;

export type AnalyticsView = (typeof analyticsViews)[number];
export type AnalyticsGrain = 'auto' | 'day' | 'week' | 'month';
export type AnalyticsResolvedGrain = Exclude<AnalyticsGrain, 'auto'>;
export type AnalyticsRange = '7d' | '14d' | '30d' | '90d' | 'year' | 'all' | 'custom';

export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const reportingDateSchema = z
  .string()
  .regex(ISO_DATE_PATTERN)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Invalid calendar date');

export const analyticsQuerySchema = z
  .object({
    view: z
      .enum(analyticsViews)
      .default('command')
      .describe(
        'Choose exactly one canonical workspace: command for executive cross-section summaries and signals; money for profit meanings, paid contribution, Profit ×, economics timelines, forecasts, posting cohorts, and Friday accounting; acquisition for Meta spend, campaigns, ad sets, ads, attribution, and paid-acquisition efficiency; fulfillment for submitted/confirmed/posted/active/delivered/paid/returned lifecycle, shipments, delivery attempts, and operational forecasts; storefront for first-party sessions, funnel, landing pages, onsite searches, products, and web vitals; search for Search Console; catalog for products, baskets, customers, and geography; assumptions for planning versus observed returns, FX, operating costs, and manual calculator inputs.',
      ),
    range: z
      .enum(['7d', '14d', '30d', '90d', 'year', 'all', 'custom'])
      .default('30d')
      .describe(
        'Use custom whenever the operator supplies explicit dates or a calendar period such as this month, last month, this week, or last week; resolve both boundaries from the supplied current application date. A calendar month is not a rolling 30-day preset. Use a preset only when the operator requests that rolling preset or supplies no date period.',
      ),
    startDate: reportingDateSchema
      .optional()
      .describe('Inclusive YYYY-MM-DD start date; required when range is custom.'),
    endDate: reportingDateSchema
      .optional()
      .describe('Inclusive YYYY-MM-DD end date; required when range is custom.'),
    grain: z
      .enum(['auto', 'day', 'week', 'month'])
      .default('auto')
      .describe('Time-series grain. Keep auto unless the operator requests a specific grain.'),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.range === 'custom' && (!value.startDate || !value.endDate)) {
      context.addIssue({
        code: 'custom',
        message: 'Custom ranges require startDate and endDate.',
        path: ['startDate'],
      });
    }
    if (value.startDate && value.endDate && value.startDate > value.endDate) {
      context.addIssue({
        code: 'custom',
        message: 'startDate must not follow endDate.',
        path: ['startDate'],
      });
    }
  });

export type AnalyticsQuery = z.input<typeof analyticsQuerySchema>;

export type AnalyticsFilters = {
  view: AnalyticsView;
  range: AnalyticsRange;
  startDate: string | null;
  endDate: string;
  grain: AnalyticsGrain;
  resolvedGrain: AnalyticsResolvedGrain;
  comparisonStartDate: string | null;
  comparisonEndDate: string | null;
};

export type AnalyticsMetric = {
  key: string;
  value: number | null;
  previous: number | null;
  changePct: number | null;
  comparison?: {
    basis: 'projected_completion';
    value: number;
    previous: number;
  };
  unit: 'dzd' | 'eur' | 'number' | 'percent' | 'ratio' | 'hours';
  goodWhen?: 'up' | 'down' | 'neutral';
};

export type AnalyticsSource = {
  key:
    'orders' | 'ecotrack' | 'meta' | 'storefront' | 'searchConsole' | 'settlements' | 'assumptions';
  state: 'live' | 'current' | 'lagged' | 'manual' | 'partial' | 'missing';
  updatedAt: string | null;
  throughDate: string | null;
  records: number;
  coveragePct: number | null;
};

export type AnalyticsEffectiveRange = {
  key: string;
  startDate: string | null;
  endDate: string;
  sources: AnalyticsSource['key'][];
};

export type AnalyticsEconomicsPoint = {
  bucket: string;
  label: string;
  grossProfitDzd: number | null;
  adjustedProfitDzd: number | null;
  adCostDzd: number | null;
  netProfitDzd: number | null;
  trueProfitDzd: number | null;
  realizedProfitDzd: number | null;
  realizedProfitAfterAdsDzd: number | null;
  postedOrders: number;
  settledOrders: number;
  profitX: number | null;
  profitXBeforeReturns: number | null;
  projectedCoveragePct: number | null;
  cumulativeNetProfitDzd: number | null;
  cumulativeTrueProfitDzd: number | null;
  cumulativeRealizedProfitDzd: number | null;
  isPartial: boolean;
  grossProfitDzdProjected: number | null;
  adjustedProfitDzdProjected: number | null;
  adCostDzdProjected: number | null;
  netProfitDzdProjected: number | null;
  trueProfitDzdProjected: number | null;
  profitXProjected: number | null;
  profitXBeforeReturnsProjected: number | null;
  cumulativeNetProfitDzdProjected: number | null;
  cumulativeTrueProfitDzdProjected: number | null;
  projectionDays: number;
  isForecast?: boolean;
};

export type AnalyticsAutomaticPaidDay = {
  date: string;
  paidOrders: number;
  codDzd: number;
  feesDzd: number;
  netRecoveredDzd: number;
  productCostDzd: number;
  profitDzd: number;
  completeOrders: number;
  providerAmountOrders: number;
  legacyAmountOrders: number;
  submittedAmountOrders: number;
};

export type AnalyticsAutomaticPaidEconomics = {
  summary: {
    paidOrders: number;
    codDzd: number;
    feesDzd: number;
    netRecoveredDzd: number;
    productCostDzd: number;
    profitDzd: number;
    completeOrders: number;
    profitCoveragePct: number | null;
    providerAmountCoveragePct: number | null;
    legacyFallbackOrders: number;
    submittedFallbackOrders: number;
  };
  days: AnalyticsAutomaticPaidDay[];
};

export type AnalyticsEntityLevel = 'campaign' | 'adset' | 'ad';

export type AnalyticsCashStage = {
  key:
    | 'submitted'
    | 'confirmed'
    | 'inTransit'
    | 'deliveredAwaitingCollection'
    | 'collectedAwaitingPayout'
    | 'paymentReady'
    | 'paid';
  orders: number;
  amountDzd: number;
  providerAmountCoveragePct: number | null;
  medianAgeHours: number | null;
  oldestAgeHours: number | null;
  staleOrders: number;
  confidencePct?: number | null;
};

export type AnalyticsLeadingOrderForecast = {
  asOfDate: string;
  historicalWindow: {
    startDate: string;
    endDate: string;
    submittedOrders: number;
    confirmedOrders: number;
    postedOrders: number;
  };
  rates: {
    submittedToConfirmedPct: number | null;
    confirmedToPostedPct: number | null;
    submittedToPostedPct: number | null;
  };
  stages: {
    submitted: {
      orders: number;
      codDzd: number;
      grossProfitDzd: number;
      expectedPostedOrders: number;
      expectedGrossProfitDzd: number;
      expectedAdjustedProfitDzd: number;
      confidencePct: number | null;
      expectedPostingDate: string;
    };
    confirmed: {
      orders: number;
      codDzd: number;
      grossProfitDzd: number;
      expectedPostedOrders: number;
      expectedGrossProfitDzd: number;
      expectedAdjustedProfitDzd: number;
      confidencePct: number | null;
      expectedPostingDate: string;
    };
  };
  days: Array<{
    date: string;
    expectedPostedOrders: number;
    expectedGrossProfitDzd: number;
    expectedAdjustedProfitDzd: number;
    forecastPaidOrders: number | null;
  }>;
  expectedPostedOrders: number;
  expectedGrossProfitDzd: number;
  expectedAdjustedProfitDzd: number;
  forecastPaidOrders: number | null;
};
