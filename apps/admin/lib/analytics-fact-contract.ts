import { z } from 'zod';

export const ANALYTICS_FACT_SEMANTICS_VERSION = 7;

const optionalNumber = z.number().finite().nullable().optional();
const nullableNumber = z.number().finite().nullable();

// The scalar fact columns serve aggregate SQL. This payload preserves the
// calculator's source distinctions and accounting when reading a partial range.
export const analyticsCalculatorDaySchema = z.object({
  version: z.literal(1),
  day: z.object({
    date: z.iso.date(),
    spendEur: nullableNumber,
    impressions: optionalNumber,
    fbPurchases: nullableNumber,
    cpm: nullableNumber,
    ctr: nullableNumber,
    linkClicks: nullableNumber,
    landingPageViews: nullableNumber,
    grossProfitDzd: nullableNumber,
    returnRatePct: nullableNumber,
    confirmedOrders: nullableNumber,
    note: z.string().nullable(),
    fxRateUsed: nullableNumber,
    metaSyncedAt: z.string().nullable().optional(),
    grossProfitSource: z.enum(['manual', 'automatic', 'missing']).optional(),
    returnRateSource: z.enum(['manual', 'default', 'missing']).optional(),
    confirmedOrdersSource: z.enum(['manual', 'automatic', 'missing']).optional(),
    postedOrders: z.number(),
    costCompleteOrders: z.number(),
    projectedCoveragePct: optionalNumber,
    stateAdjustedProfitDzd: optionalNumber,
    returnExposedOrders: z.number().optional(),
    metrics: z.object({
      adCostDzd: nullableNumber,
      adjustedProfitDzd: nullableNumber,
      netProfitDzd: nullableNumber,
      profitX: nullableNumber,
      netProfitBeforeReturnsDzd: nullableNumber,
      profitXBeforeReturns: nullableNumber,
      costPerConfirmedDzd: nullableNumber,
      confirmationRatePct: nullableNumber,
      clickToPageRatePct: nullableNumber,
    }),
    isRestDay: z.boolean(),
    profitsSuppressed: z.boolean().optional(),
    rolledInDzd: z.number(),
    rolledOutDzd: z.number(),
    operatingCostDzd: z.number(),
    trueProfitDzd: nullableNumber,
  }),
});

/**
 * Used only when immutable line-item purchase cost is unavailable. Exact
 * purchase-cost coverage remains reported separately from this estimate.
 */
export const ANALYTICS_FALLBACK_PRODUCT_MARGIN_RATE = 0.3;
