import { z } from 'zod';
import { reportingDateSchema } from './analytics/contract';
import type { WebsiteExperienceStats } from './stats-experience-shared';

const statsRangeSchema = z.enum(['all', '7d', '14d', '30d', '90d', 'year', 'custom']);
const optionalDateSchema = reportingDateSchema.optional();

export const statsQuerySchema = z
  .object({
    range: statsRangeSchema.optional().default('30d'),
    startDate: optionalDateSchema,
    endDate: optionalDateSchema,
  })
  .superRefine((value, ctx) => {
    if (value.range === 'custom' && (!value.startDate || !value.endDate)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide both custom dates.',
        path: ['startDate'],
      });
    }

    if (value.startDate && value.endDate && value.startDate > value.endDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Start date must be before end date.',
        path: ['startDate'],
      });
    }
  });

export type StatsFilters = z.infer<typeof statsQuerySchema>;

type WebsiteProductInterest = {
  id: string;
  title: string;
  sku: string | null;
  categoryName: string | null;
  brandName: string | null;
  viewCount: number;
  addToCartCount: number;
  checkoutCount: number;
  websitePurchaseCount: number;
  popularityScore: number;
  websiteConversionRate: number;
};

export type WebsiteAnalyticsData = {
  sessions: number;
  journeys: number;
  pageViews: number;
  productViews: number;
  addToCarts: number;
  checkoutStarts: number;
  purchases: number;
  searches: number;
  zeroResultSearches: number;
  sessionConversionRate: number;
  viewToCartRate: number;
  cartToPurchaseRate: number;
  checkoutToPurchaseRate: number;
  topSearches: Array<{ term: string; searches: number; zeroResults: number }>;
  funnel: Array<{ name: string; value: number }>;
  topProducts: WebsiteProductInterest[];
} & WebsiteExperienceStats;
