import { z } from 'zod';

import type { UnmatchedImportRow } from '@bric/db/schema';
import type { MetaCommerceReport } from './meta-commerce-analytics';
import type {
  AiAssistantStats,
  CustomerStats,
  LandingPageStats,
  MetaPaidAttributionStats,
  WebsiteExperienceStats,
} from './stats-experience';
import type { ImportHistoryItem } from './stats-order-import';

const statsRangeSchema = z.enum(['all', '7d', '14d', '30d', '90d', 'year', 'custom']);
const optionalDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional();

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

type UnmatchedOrderDetail = UnmatchedImportRow & {
  batchId: string;
};

export type TrendPoint = {
  bucket: string;
  orders: number;
  revenue: number;
  profit: number;
  fees: number;
};

type BreakdownPoint = {
  name: string;
  orders: number;
  revenue: number;
  profit: number;
  collected?: number;
  fees?: number;
  netRevenue?: number;
  avgOrder?: number;
};

export type ProductPerformance = {
  id: string;
  title: string;
  unitsSold: number;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
  sku: string | null;
  categoryName: string | null;
  brandName: string | null;
  totalOrderCount?: number;
  confirmedOrderCount?: number;
  confirmationRate?: number | null;
  viewCount?: number;
  addToCartCount?: number;
  checkoutCount?: number;
  websitePurchaseCount?: number;
  popularityScore?: number;
  websiteConversionRate?: number;
};

type WebsiteSearchPoint = {
  term: string;
  searches: number;
  zeroResults: number;
};

type WebsiteFunnelPoint = {
  name: string;
  value: number;
};

type MetaTrackedEventSummary = {
  name: string;
  total: number;
  pixelFired: number;
  capiSent: number;
  capiDelivered: number;
  capiFailed: number;
  lastOccurredAt: string | null;
};

type MetaTrackedEventLog = {
  eventId: string;
  analyticsEventName: string;
  metaEventName: string;
  pagePath: string | null;
  occurredAt: string;
  pixelPayload: Record<string, unknown>;
  capiPayload: Record<string, unknown>;
  capiStatus: number | null;
  capiOk: boolean;
};

type ProfitabilityPoint = {
  name: string;
  value: number;
  fill: string;
};

export type StatsDashboardData = {
  filters: Required<StatsFilters>;
  snapshot?: {
    generatedAt: string;
    staleAt: string;
    isStale: boolean;
    trigger: string;
    sourceImportBatchId: string | null;
    reportThroughDate: string | null;
    financialDataIsLagging: boolean;
  };
  summary: {
    totalOrders: number;
    totalAmountCollected: number;
    totalFees: number;
    totalNetRevenue: number;
    totalProductCost: number;
    totalGrossProfit: number;
    adSpend: number;
    netProfitAfterAds: number;
    averageOrderValue: number;
    averageProfitPerOrder: number;
    profitMargin: number;
    profitMarginAfterAds: number;
    fulfillmentRate: number;
    matchedOrders: number;
    totalConfirmedOrders: number;
    profitableOrders: number;
    unprofitableOrders: number;
    breakEvenOrders: number;
  };
  trends: {
    daily: TrendPoint[];
    weekly: TrendPoint[];
    monthly: TrendPoint[];
    imports: TrendPoint[];
  };
  feeBreakdown: {
    livraison: number;
    poids: number;
    extra: number;
    sms: number;
    stockage: number;
    commission: number;
    total: number;
    avgPerOrder: number;
  };
  adCosts: {
    totalSpend: number;
    roas: number;
    cpa: number;
    cpc: number;
    ctr: number;
    conversionRate: number;
  };
  metaAds: {
    events: MetaTrackedEventSummary[];
    recentPayloads: MetaTrackedEventLog[];
    trackingAvailable?: boolean;
    paidAttribution: MetaPaidAttributionStats;
    commerce: MetaCommerceReport;
    health?: {
      pending: number;
      retryable: number;
      delivered: number;
      failed: number;
      skipped: number;
      oldestPendingAt: string | null;
      eligibleOrders: number;
      confirmedOrders: number;
      orderConfirmedOrders: number;
      purchaseOrders: number;
      negativeOutcomePurchases: number;
      workerLastHeartbeatAt: string | null;
    };
  };
  wilayas: BreakdownPoint[];
  wilayaDetails: BreakdownPoint[];
  deliveries: BreakdownPoint[];
  topProducts: ProductPerformance[];
  allProducts: ProductPerformance[];
  topCategories: ProductPerformance[];
  topBrands: ProductPerformance[];
  profitability: ProfitabilityPoint[];
  importHistory: ImportHistoryItem[];
  latestUnmatchedReferences: string[];
  latestUnmatchedDetails: UnmatchedOrderDetail[];
  website: {
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
    topSearches: WebsiteSearchPoint[];
    funnel: WebsiteFunnelPoint[];
    topProducts: ProductPerformance[];
  } & WebsiteExperienceStats;
  landingPages: LandingPageStats;
  aiAssistants: AiAssistantStats;
  customers: CustomerStats;
};
