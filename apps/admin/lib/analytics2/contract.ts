import { z } from 'zod';

const analytics2Views = [
  'command',
  'money',
  'acquisition',
  'fulfillment',
  'storefront',
  'search',
  'catalog',
  'assumptions',
] as const;

export type Analytics2View = (typeof analytics2Views)[number];
export type Analytics2Grain = 'auto' | 'day' | 'week' | 'month';
export type Analytics2ResolvedGrain = Exclude<Analytics2Grain, 'auto'>;
export type Analytics2Range = '7d' | '14d' | '30d' | '90d' | 'year' | 'all' | 'custom';

export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const dateOnlySchema = z
  .string()
  .regex(ISO_DATE_PATTERN)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Invalid calendar date');

export const analytics2QuerySchema = z
  .object({
    view: z
      .enum(analytics2Views)
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
    startDate: dateOnlySchema
      .optional()
      .describe('Inclusive YYYY-MM-DD start date; required when range is custom.'),
    endDate: dateOnlySchema
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

export type Analytics2Query = z.input<typeof analytics2QuerySchema>;

export type Analytics2Filters = {
  view: Analytics2View;
  range: Analytics2Range;
  startDate: string | null;
  endDate: string;
  grain: Analytics2Grain;
  resolvedGrain: Analytics2ResolvedGrain;
  comparisonStartDate: string | null;
  comparisonEndDate: string | null;
};

export type Analytics2Metric = {
  key: string;
  value: number | null;
  previous: number | null;
  changePct: number | null;
  unit: 'dzd' | 'eur' | 'number' | 'percent' | 'ratio' | 'hours';
  goodWhen?: 'up' | 'down' | 'neutral';
};

export type Analytics2Source = {
  key:
    'orders' | 'ecotrack' | 'meta' | 'storefront' | 'searchConsole' | 'settlements' | 'assumptions';
  state: 'live' | 'current' | 'lagged' | 'manual' | 'partial' | 'missing';
  updatedAt: string | null;
  throughDate: string | null;
  records: number;
  coveragePct: number | null;
};

export type Analytics2EffectiveRange = {
  key: string;
  startDate: string | null;
  endDate: string;
  sources: Analytics2Source['key'][];
};

export type Analytics2EconomicsPoint = {
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
};

export type Analytics2AutomaticPaidDay = {
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

export type Analytics2AutomaticPaidEconomics = {
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
  days: Analytics2AutomaticPaidDay[];
};

export type Analytics2EntityLevel = 'campaign' | 'adset' | 'ad';

export type Analytics2CashStage = {
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

export type Analytics2LeadingOrderForecast = {
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
