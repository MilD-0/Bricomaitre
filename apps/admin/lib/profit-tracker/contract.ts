import { getDb } from '@bric/db/client';
import { z } from 'zod';
import { reportingDateSchema as dateOnlySchema } from '../analytics/contract';
import { type ProfitTrackerSettings } from '../profit-tracker-metrics';

export type Database = ReturnType<typeof getDb>;

export const DEFAULT_SETTINGS: ProfitTrackerSettings = {
  fxRate: 280,
  defaultReturnRate: 10,
  restFrom: null,
};

export const ANALYTICS_TIMEZONE = 'Africa/Algiers';

const nullableNonnegative = z.number().finite().nonnegative().nullable().optional();

export const profitTrackerRangeSchema = z
  .object({
    range: z.enum(['7d', '14d', '30d', '90d', 'year', 'all', 'custom']).default('30d'),
    startDate: dateOnlySchema.optional(),
    endDate: dateOnlySchema.optional(),
  })
  .superRefine((value, context) => {
    if (value.range === 'custom' && (!value.startDate || !value.endDate)) {
      context.addIssue({
        code: 'custom',
        message: 'Custom ranges require startDate and endDate.',
      });
    }
    if (value.startDate && value.endDate && value.startDate > value.endDate) {
      context.addIssue({
        code: 'custom',
        message: 'startDate must not follow endDate.',
      });
    }
  });

export const profitTrackerSettingsSchema = z.object({
  fxRate: z.number().finite().positive().max(100_000),
  defaultReturnRate: z.number().finite().min(0).max(100),
  restFrom: dateOnlySchema.nullable(),
});

export const profitTrackerDaySchema = z
  .object({
    date: dateOnlySchema,
    spendEur: nullableNonnegative,
    fbPurchases: nullableNonnegative,
    cpm: nullableNonnegative,
    ctr: z.number().finite().min(0).max(100).nullable().optional(),
    linkClicks: z.number().int().nonnegative().nullable().optional(),
    landingPageViews: nullableNonnegative,
    grossProfitDzd: z.number().finite().nullable().optional(),
    returnRatePct: z.number().finite().min(0).max(100).nullable().optional(),
    confirmedOrders: z.number().int().nonnegative().nullable().optional(),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

const profitTrackerCostFieldsSchema = z.object({
  name: z.string().trim().min(1).max(80),
  amountDzd: z.number().finite().nonnegative().max(1_000_000_000_000),
  period: z.enum(['monthly', 'once']),
  startDate: dateOnlySchema,
  endDate: dateOnlySchema.nullable(),
});

export const profitTrackerCostPatchSchema = profitTrackerCostFieldsSchema
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one cost change.');

export const profitTrackerCostSchema = profitTrackerCostFieldsSchema
  .extend({ endDate: dateOnlySchema.nullable().default(null) })
  .superRefine((value, context) => {
    if (value.endDate && value.endDate < value.startDate) {
      context.addIssue({
        code: 'custom',
        message: 'endDate must not precede startDate.',
        path: ['endDate'],
      });
    }
  });

export const profitTrackerCostCreateSchema = profitTrackerCostSchema.and(
  z.object({ requestId: z.uuid() }),
);

export type ProfitTrackerRangeInput = z.input<typeof profitTrackerRangeSchema>;

export type ProfitTrackerDayUpdate = z.infer<typeof profitTrackerDaySchema>;

export type ProfitTrackerMetaRow = {
  day: string;
  accountCurrency: string;
  spend: string | number;
  impressions: number;
  inlineLinkClicks: number;
  landingPageViews: string | number;
  purchases: string | number;
  syncedAt: Date;
};

export type ProfitTrackerMetaSyncRange = {
  since: string;
  until: string;
  accountCurrency: string;
  syncedAt: Date;
};

export type AutomaticDayEconomics = {
  date: string;
  postedOrders: number;
  costCompleteOrders: number;
  grossProfitDzd: number | null;
  realizedGrossProfitDzd: number;
  returnExposedGrossProfitDzd: number;
  returnExposedOrders: number;
};

export type OrderCohortDayEconomics = {
  date: string;
  orderCount: number;
  costCompleteOrders: number;
  grossProfitDzd: number | null;
  realizedGrossProfitDzd: number;
  returnExposedGrossProfitDzd: number;
  returnExposedOrders: number;
};

export type CanonicalOrderProjectionBasis = 'confirmed' | 'posted';

export type CanonicalOrderProjectionDay = {
  basis: CanonicalOrderProjectionBasis;
  reportDay: string;
  grossProfit: number | null;
  adSpend: number | null;
  estimatedReturnRate: number;
  estimatedReturnedOrders: number;
  estimatedReturnLoss: number | null;
  projectedProfit: number | null;
};

export type MetaDayEconomics = {
  date: string;
  accountCurrency: string | null;
  spendEur: number;
  impressions: number;
  fbPurchases: number;
  cpm: number;
  ctr: number;
  linkClicks: number;
  landingPageViews: number;
  metaSyncedAt: string | null;
};

export type RealizedDayEconomics = {
  date: string;
  settledOrders: number;
  amountCollectedDzd: number;
  netRevenueDzd: number;
  feesDzd: number;
  realizedProfitDzd: number;
};
