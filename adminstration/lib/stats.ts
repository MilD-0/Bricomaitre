import { and, count, desc, eq, inArray, or, sql } from 'drizzle-orm';
import * as XLSX from 'xlsx';
import { z } from 'zod';

import { getDb } from '../db/client';
import {
  adCosts,
  adSpendImportBatches,
  adminReportingSnapshotRuns,
  adminReportingSnapshots,
  analyticsEvents,
  analyticsJourneys,
  brands,
  categories,
  importBatches,
  metaEventOutbox,
  metaWorkerHeartbeat,
  orderMetaAttribution,
  orderStatusHistory,
  type UnmatchedImportRow,
  orders,
  processedOrderProducts,
  processedOrders,
  products,
} from '../db/schema';
import type { ActionActor } from './action-history';
import { mutateEntityWithHistory } from './action-history';
import { coerceOrderStatus, isConfirmedLifecycleStatus, isMongoObjectId, parseOrderProductId } from './orders';
import { applyServerCache, CACHE_TAGS } from './server-cache';

const statsRangeSchema = z.enum(['all', '30d', '90d', 'year', 'custom']);
const optionalDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional();

export const statsQuerySchema = z
  .object({
    range: statsRangeSchema.optional().default('90d'),
    startDate: optionalDateSchema,
    endDate: optionalDateSchema,
  })
  .superRefine((value, ctx) => {
    if (value.range === 'custom' && !value.startDate && !value.endDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide at least one custom date.',
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

const PHONE_MATCH_MAX_AGE_MS = 21 * 24 * 60 * 60 * 1000;

export function isNumericOrderReference(value: string) {
  return /^\d+$/.test(value.trim());
}

export function normalizePhoneDigits(value: string) {
  return value.replace(/\D+/g, '');
}

export function resolveOrderByPhoneAndDate<T extends { createdAt: Date | null; id?: number | string }>(
  candidates: T[],
  phoneDate: Date | null,
) {
  if (candidates.length === 0) {
    return null;
  }

  if (candidates.length === 1) {
    return candidates[0] ?? null;
  }

  if (!(phoneDate instanceof Date) || Number.isNaN(phoneDate.getTime())) {
    return null;
  }

  const ranked = candidates
    .filter((candidate) => candidate.createdAt instanceof Date && !Number.isNaN(candidate.createdAt.getTime()))
    .map((candidate) => ({
      candidate,
      delta: Math.abs(candidate.createdAt!.getTime() - phoneDate.getTime()),
    }))
    .sort((left, right) => left.delta - right.delta);

  const best = ranked[0];
  const next = ranked[1];

  if (!best || best.delta > PHONE_MATCH_MAX_AGE_MS) {
    return null;
  }

  if (next && next.delta === best.delta) {
    return null;
  }

  return best.candidate;
}

type SpreadsheetRow = {
  encaisseLe: Date | null;
  montant: number;
  fraisLivraison: number;
  fraisPoids: number;
  fraisExtra: number;
  fraisSMS: number;
  fraisStockage: number;
  commissionRecouvrement: number;
  totalFraisService: number;
  netRecouvret: number;
  type: string;
  typePrestation: string;
  creeLe: Date | null;
  tracking: string;
  reference: string;
  destinataire: string;
  telephone: string;
  commune: string;
  wilaya: string;
  produits: string;
  remarque: string;
  poidsLivreLe: string;
  encaisse: number;
};

type ImportHistoryItem = {
  id: number;
  batchId: string;
  fileName: string;
  importedAt: string;
  totalRows: number;
  matchedOrders: number;
  skippedRows?: number;
  unmatchedCount: number;
  unmatchedReferences: string[];
  unmatchedDetails: UnmatchedImportRow[];
  dateRangeStart: string | null;
  dateRangeEnd: string | null;
};

export type ImportHistoryPage = {
  items: ImportHistoryItem[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

export type UnmatchedOrderDetail = UnmatchedImportRow & {
  batchId: string;
};

type TrendPoint = {
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

type ProductPerformance = {
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

type WebsiteLandingPoint = {
  path: string;
  sessions: number;
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

type WebsiteVariantPoint = {
  variant: string;
  sessions: number;
  pageViews: number;
  productViews: number;
  addToCarts: number;
  checkoutStarts: number;
  purchases: number;
  sessionConversionRate: number;
  cartToPurchaseRate: number;
  checkoutToPurchaseRate: number;
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

type CartProductReferenceBuckets = {
  productIds: number[];
  mongoIds: string[];
};

type CartProductLookupRow = {
  id: number;
  mongoId: string | null;
};

export function getCartProductLookupKey(rawValue: string) {
  const trimmed = rawValue.trim();

  if (!trimmed) {
    return null;
  }

  if (isMongoObjectId(trimmed)) {
    return `mongo:${trimmed}`;
  }

  const productId = parseOrderProductId(trimmed);
  return productId === null ? null : `id:${productId}`;
}

export function collectCartProductReferenceBuckets(rows: Array<{ cartProducts: string[] | null }>): CartProductReferenceBuckets {
  const productIds = new Set<number>();
  const mongoIds = new Set<string>();

  for (const row of rows) {
    for (const rawValue of row.cartProducts ?? []) {
      const trimmed = rawValue.trim();

      if (isMongoObjectId(trimmed)) {
        mongoIds.add(trimmed);
        continue;
      }

      const productId = parseOrderProductId(trimmed);
      if (productId !== null) {
        productIds.add(productId);
      }
    }
  }

  return {
    productIds: [...productIds],
    mongoIds: [...mongoIds],
  };
}

export function buildCartProductLookup<T extends CartProductLookupRow>(rows: T[]) {
  const lookup = new Map<string, T>();

  for (const row of rows) {
    lookup.set(`id:${row.id}`, row);

    if (row.mongoId) {
      lookup.set(`mongo:${row.mongoId}`, row);
    }
  }

  return lookup;
}

export type StatsDashboardData = {
  filters: Required<StatsFilters>;
  snapshot?: {
    generatedAt: string;
    staleAt: string;
    isStale: boolean;
    trigger: string;
    sourceImportBatchId: string | null;
    reportThroughDate: string | null;
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
    variants: WebsiteVariantPoint[];
    topLandingPages: WebsiteLandingPoint[];
    topSearches: WebsiteSearchPoint[];
    funnel: WebsiteFunnelPoint[];
    topProducts: ProductPerformance[];
  };
};

export type StatsImportResult = {
  batchId: string;
  newOrders: number;
  duplicateOrders: number;
  unmatchedReferences: string[];
  stats: StatsDashboardData;
};

const manualOrderProductSchema = z.object({
  productId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  sku: z.string().trim().nullable().optional(),
  price: z.number().nonnegative().default(0),
  cost: z.number().nonnegative().default(0),
  categoryId: z.string().trim().nullable().optional(),
  categoryName: z.string().trim().nullable().optional(),
  brandId: z.string().trim().nullable().optional(),
  brandName: z.string().trim().nullable().optional(),
  quantity: z.number().int().positive().default(1),
});

export const manualOrderInputSchema = z.object({
  tracking: z.string().trim().min(1),
  customerName: z.string().trim().optional().default(''),
  wilaya: z.string().trim().optional().default(''),
  commune: z.string().trim().optional().default(''),
  amountCollected: z.number().nonnegative(),
  deliveryType: z.string().trim().optional().default(''),
  deliveredAt: z.string().trim().nullable().optional(),
  encaissedAt: z.string().trim().nullable().optional(),
  createdAt: z.string().trim().nullable().optional(),
  products: z.array(manualOrderProductSchema).default([]),
  feeBreakdown: z.object({
    livraison: z.number().nonnegative().default(0),
    poids: z.number().nonnegative().default(0),
    extra: z.number().nonnegative().default(0),
    sms: z.number().nonnegative().default(0),
    stockage: z.number().nonnegative().default(0),
    commission: z.number().nonnegative().default(0),
  }),
});

export const manualOrderListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
});

export const adCostEntrySchema = z.object({
  date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  platform: z.string().trim().min(1).default('facebook'),
  campaignName: z.string().trim().optional().nullable(),
  campaignId: z.string().trim().optional().nullable(),
  spend: z.number().nonnegative(),
  impressions: z.number().int().nonnegative().optional(),
  clicks: z.number().int().nonnegative().optional(),
  conversions: z.number().int().nonnegative().optional(),
  reach: z.number().int().nonnegative().optional(),
  notes: z.string().trim().optional().nullable(),
  importBatchId: z.string().uuid().optional().nullable(),
});

export type ManualOrderInput = z.infer<typeof manualOrderInputSchema>;
export type AdCostEntryInput = z.infer<typeof adCostEntrySchema>;

const COLUMN_MAP: Record<keyof SpreadsheetRow, string[]> = {
  encaisseLe: ['Encaissé le', 'Encaisse le', 'encaisse_le'],
  montant: ['montant', 'Montant'],
  fraisLivraison: ['Frais de livraison', 'frais_livraison'],
  fraisPoids: ['Frais poids', 'frais_poids'],
  fraisExtra: ['Frais en extra', 'frais_extra'],
  fraisSMS: ['Frais SMS', 'frais_sms'],
  fraisStockage: ['Frais Stockage', 'frais_stockage'],
  commissionRecouvrement: ['Commission recouvrement', 'commission'],
  totalFraisService: ['Total frais de service', 'total_frais'],
  netRecouvret: ['Net recouvert', 'Net recouvret', 'net_recouvrement', 'Net recouvrement'],
  type: ['Type'],
  typePrestation: ['Type de préstation', 'Type de prestation'],
  creeLe: ['Crée le', 'cree_le', 'created_at'],
  tracking: ['Tracking', 'tracking', 'Numéro de suivi'],
  reference: ['Réference', 'Référence', 'Reference', 'reference', 'ref'],
  destinataire: ['déstinataire', 'destinataire', 'Destinataire', 'client'],
  telephone: ['Téléphone', 'telephone', 'phone'],
  commune: ['Commune', 'commune'],
  wilaya: ['Wilaya', 'wilaya'],
  produits: ['Produits', 'produits', 'products'],
  remarque: ['Remarque', 'remarque', 'note'],
  poidsLivreLe: ['Livré le', 'Poids Livré le', 'poids_livre_le'],
  encaisse: ['Encaissé', 'encaisse', 'amount'],
};

const numberFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

const statsDateExpression = sql`coalesce(${processedOrders.encaissedAt}, ${processedOrders.deliveredAt}, ${processedOrders.orderCreatedAt})`;
const analyticsResultsCountExpression = sql<number>`case
  when coalesce(${analyticsEvents.metadata}->>'resultsCount', '') ~ '^-?[0-9]+$'
    then (${analyticsEvents.metadata}->>'resultsCount')::int
  else -1
end`;
const LEGACY_AD_SPEND_IMPORT_BATCH_ID = '00000000-0000-4000-8000-000000000001';
const ADMIN_REPORTING_STALE_AFTER_MS = 26 * 60 * 60 * 1000;
const ADMIN_REPORTING_STANDARD_INPUTS = [
  { range: '30d' },
  { range: '90d' },
  { range: 'year' },
  { range: 'all' },
] satisfies StatsFilters[];

type WebsiteSummaryRow = {
  sessions: number;
  journeys: number;
  pageViews: number;
  productViews: number;
  addToCarts: number;
  checkoutStarts: number;
  purchases: number;
  searches: number;
  zeroResultSearches: number;
};

type WebsiteLandingRow = {
  path: string;
  sessions: number;
};

type WebsiteSearchRow = {
  term: string;
  searches: number;
  zeroResults: number;
};

type WebsiteTopProductRow = {
  id: number;
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

type WebsiteMetricRow = {
  id: number;
  viewCount: number;
  addToCartCount: number;
  checkoutCount: number;
  websitePurchaseCount: number;
  popularityScore: number;
  websiteConversionRate: number;
};

type WebsiteVariantRow = {
  variant: string;
  sessions: number;
  pageViews: number;
  productViews: number;
  addToCarts: number;
  checkoutStarts: number;
  purchases: number;
};

type MetaTrackedEventSummaryRow = {
  name: string;
  total: number;
  pixelFired: number;
  capiSent: number;
  capiDelivered: number;
  capiFailed: number;
  lastOccurredAt: Date | string | null;
};

type MetaTrackedEventLogRow = {
  eventId: string;
  analyticsEventName: string;
  metaEventName: string;
  pagePath: string | null;
  occurredAt: Date | string;
  pixelPayload: Record<string, unknown>;
  capiPayload: Record<string, unknown>;
  capiStatus: number | null;
  capiOk: boolean;
};

function toIsoDateString(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function getWebsiteAnalyticsData(db: ReturnType<typeof getDb>, analyticsWhere: ReturnType<typeof buildAnalyticsWhere>) {
  const [
    websiteSummaryRows,
    websiteVariantRows,
    websiteLandingRows,
    websiteSearchRows,
    websiteTopProductRows,
    websiteMetricRows,
  ] = await Promise.all([
    db
      .select({
        sessions: sql<number>`count(distinct case when ${analyticsEvents.eventName} = 'page_view' then ${analyticsEvents.sessionId} end)::int`,
        journeys: sql<number>`count(distinct ${analyticsEvents.journeyId})::int`,
        pageViews: sql<number>`count(*) filter (where ${analyticsEvents.eventName} = 'page_view')::int`,
        productViews: sql<number>`count(*) filter (where ${analyticsEvents.eventName} = 'view_item')::int`,
        addToCarts: sql<number>`count(*) filter (where ${analyticsEvents.eventName} = 'add_to_cart')::int`,
        checkoutStarts: sql<number>`count(*) filter (where ${analyticsEvents.eventName} = 'begin_checkout')::int`,
        purchases: sql<number>`count(*) filter (where ${analyticsEvents.eventName} = 'purchase')::int`,
        searches: sql<number>`count(*) filter (where ${analyticsEvents.eventName} = 'search')::int`,
        zeroResultSearches: sql<number>`count(*) filter (where ${analyticsEvents.eventName} = 'search' and ${analyticsResultsCountExpression} = 0)::int`,
      })
      .from(analyticsEvents)
      .where(analyticsWhere),
    db
      .select({
        variant: sql<string>`case
          when coalesce(nullif(${analyticsEvents.metadata}->>'requestedVariant', ''), nullif(${analyticsEvents.metadata}->>'storefrontVariant', ''), 'new') = 'legacy' then 'legacy'
          when coalesce(nullif(${analyticsEvents.metadata}->>'requestedVariant', ''), nullif(${analyticsEvents.metadata}->>'storefrontVariant', ''), 'new') in ('fast_checkout', 'control', 'new') then 'new'
          else coalesce(nullif(${analyticsEvents.metadata}->>'requestedVariant', ''), nullif(${analyticsEvents.metadata}->>'storefrontVariant', ''), 'new')
        end`,
        sessions: sql<number>`count(distinct case when ${analyticsEvents.eventName} = 'page_view' then ${analyticsEvents.sessionId} end)::int`,
        pageViews: sql<number>`count(*) filter (where ${analyticsEvents.eventName} = 'page_view')::int`,
        productViews: sql<number>`count(*) filter (where ${analyticsEvents.eventName} = 'view_item')::int`,
        addToCarts: sql<number>`count(*) filter (where ${analyticsEvents.eventName} = 'add_to_cart')::int`,
        checkoutStarts: sql<number>`count(*) filter (where ${analyticsEvents.eventName} = 'begin_checkout')::int`,
        purchases: sql<number>`count(*) filter (where ${analyticsEvents.eventName} = 'purchase')::int`,
      })
      .from(analyticsEvents)
      .where(analyticsWhere)
      .groupBy(sql`1`)
      .orderBy(sql`1 asc`),
    db
      .select({
        path: sql<string>`coalesce(${analyticsEvents.pagePath}, '/')`,
        sessions: sql<number>`count(distinct ${analyticsEvents.sessionId})::int`,
      })
      .from(analyticsEvents)
      .where(and(
        analyticsWhere,
        eq(analyticsEvents.eventName, 'page_view'),
        sql`coalesce(${analyticsEvents.metadata}->>'isEntry', 'false') = 'true'`,
      ))
      .groupBy(sql`1`)
      .orderBy(sql`2 desc`)
      .limit(8),
    db
      .select({
        term: sql<string>`coalesce(nullif(${analyticsEvents.searchTerm}, ''), 'Unknown')`,
        searches: sql<number>`count(*)::int`,
        zeroResults: sql<number>`count(*) filter (where ${analyticsResultsCountExpression} = 0)::int`,
      })
      .from(analyticsEvents)
      .where(and(
        analyticsWhere,
        eq(analyticsEvents.eventName, 'search'),
      ))
      .groupBy(sql`1`)
      .orderBy(sql`2 desc`)
      .limit(8),
    db
      .select({
        id: products.id,
        title: products.title,
        sku: products.sku,
        categoryName: categories.name,
        brandName: brands.name,
        viewCount: sql<number>`coalesce(${products.viewCount}, 0)::int`,
        addToCartCount: sql<number>`coalesce(${products.addToCartCount}, 0)::int`,
        checkoutCount: sql<number>`coalesce(${products.checkoutCount}, 0)::int`,
        websitePurchaseCount: sql<number>`coalesce(${products.purchaseCount}, 0)::int`,
        popularityScore: sql<number>`coalesce(${products.popularityScore}, 0)::double precision`,
        websiteConversionRate: sql<number>`coalesce(${products.conversionRate}, 0)::double precision`,
      })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .leftJoin(brands, eq(products.brandId, brands.id))
      .where(sql`${products.viewCount} > 0 or ${products.addToCartCount} > 0 or ${products.purchaseCount} > 0`)
      .orderBy(sql`${products.popularityScore} desc`)
      .limit(8),
    db
      .select({
        id: products.id,
        viewCount: sql<number>`coalesce(${products.viewCount}, 0)::int`,
        addToCartCount: sql<number>`coalesce(${products.addToCartCount}, 0)::int`,
        checkoutCount: sql<number>`coalesce(${products.checkoutCount}, 0)::int`,
        websitePurchaseCount: sql<number>`coalesce(${products.purchaseCount}, 0)::int`,
        popularityScore: sql<number>`coalesce(${products.popularityScore}, 0)::double precision`,
        websiteConversionRate: sql<number>`coalesce(${products.conversionRate}, 0)::double precision`,
      })
      .from(products),
  ]);

  return {
    websiteSummaryRows: websiteSummaryRows as WebsiteSummaryRow[],
    websiteVariantRows: websiteVariantRows as WebsiteVariantRow[],
    websiteLandingRows: websiteLandingRows as WebsiteLandingRow[],
    websiteSearchRows: websiteSearchRows as WebsiteSearchRow[],
    websiteTopProductRows: websiteTopProductRows as WebsiteTopProductRow[],
    websiteMetricRows: websiteMetricRows as WebsiteMetricRow[],
  };
}

async function getMetaAdsTrackingData(db: ReturnType<typeof getDb>, filters: Required<StatsFilters>) {
  const conditions = [];
  if (filters.startDate) {
    conditions.push(sql`${metaEventOutbox.eventTime}::date >= ${filters.startDate}`);
  }
  if (filters.endDate) {
    conditions.push(sql`${metaEventOutbox.eventTime}::date <= ${filters.endDate}`);
  }
  const metaWhere = conditions.length > 0 ? and(...conditions) : undefined;
  const pixelInvoked = sql`coalesce(${analyticsEvents.metadata}->'metaTracking'->'pixel'->>'invoked', 'false') = 'true'`;

  const [eventRows, payloadRows, [statusRow], coverageResult, [heartbeat]] = await Promise.all([
    db
      .select({
        name: metaEventOutbox.eventName,
        total: sql<number>`count(*)::int`,
        pixelFired: sql<number>`count(*) filter (where ${pixelInvoked})::int`,
        capiSent: sql<number>`count(*) filter (where ${metaEventOutbox.attemptCount} > 0)::int`,
        capiDelivered: sql<number>`count(*) filter (where ${metaEventOutbox.status} = 'delivered')::int`,
        capiFailed: sql<number>`count(*) filter (where ${metaEventOutbox.status} in ('failed', 'skipped'))::int`,
        lastOccurredAt: sql<Date | null>`max(${metaEventOutbox.eventTime})`,
      })
      .from(metaEventOutbox)
      .leftJoin(analyticsEvents, eq(analyticsEvents.eventId, metaEventOutbox.eventId))
      .where(metaWhere)
      .groupBy(metaEventOutbox.eventName)
      .orderBy(sql`2 desc, 1 asc`),
    db
      .select({
        eventId: metaEventOutbox.eventId,
        analyticsEventName: sql<string>`coalesce(${analyticsEvents.eventName}, ${metaEventOutbox.source})`,
        metaEventName: metaEventOutbox.eventName,
        pagePath: metaEventOutbox.eventSourceUrl,
        occurredAt: metaEventOutbox.eventTime,
        pixelPayload: sql<Record<string, unknown>>`jsonb_build_object('invoked', ${pixelInvoked})`,
        capiPayload: sql<Record<string, unknown>>`jsonb_build_object(
          'status', ${metaEventOutbox.status},
          'attemptCount', ${metaEventOutbox.attemptCount},
          'eventsReceived', ${metaEventOutbox.eventsReceived},
          'matchKeys', ${metaEventOutbox.matchKeySummary},
          'value', ${metaEventOutbox.customData}->'value',
          'numItems', ${metaEventOutbox.customData}->'num_items',
          'errorCode', ${metaEventOutbox.metaErrorCode},
          'errorSubcode', ${metaEventOutbox.metaErrorSubcode},
          'errorMessage', ${metaEventOutbox.metaErrorMessage},
          'fbtraceId', ${metaEventOutbox.fbtraceId}
        )`,
        capiStatus: metaEventOutbox.lastHttpStatus,
        capiOk: sql<boolean>`${metaEventOutbox.status} = 'delivered'`,
      })
      .from(metaEventOutbox)
      .leftJoin(analyticsEvents, eq(analyticsEvents.eventId, metaEventOutbox.eventId))
      .where(metaWhere)
      .orderBy(desc(metaEventOutbox.eventTime))
      .limit(12),
    db
      .select({
        pending: sql<number>`count(*) filter (where ${metaEventOutbox.status} = 'pending')::int`,
        retryable: sql<number>`count(*) filter (where ${metaEventOutbox.status} = 'retryable')::int`,
        delivered: sql<number>`count(*) filter (where ${metaEventOutbox.status} = 'delivered')::int`,
        failed: sql<number>`count(*) filter (where ${metaEventOutbox.status} = 'failed')::int`,
        skipped: sql<number>`count(*) filter (where ${metaEventOutbox.status} = 'skipped')::int`,
        oldestPendingAt: sql<Date | null>`min(${metaEventOutbox.createdAt}) filter (
          where ${metaEventOutbox.status} in ('pending', 'retryable', 'processing')
        )`,
      })
      .from(metaEventOutbox)
      .where(metaWhere),
    db.execute(sql`
      select
        count(distinct attribution.order_id)::int as eligible_orders,
        count(distinct attribution.order_id) filter (
          where exists (
            select 1 from ${orderStatusHistory} history
            where history.order_id = attribution.order_id
              and history.status = 2
          )
        )::int as confirmed_orders,
        count(distinct purchase.order_id)::int as purchase_orders,
        count(distinct orderconfirmed.order_id)::int as orderconfirmed_orders,
        count(distinct purchase.order_id) filter (
          where current_order.confirmed in (6, 8, 9)
        )::int as negative_outcome_purchases
      from ${orderMetaAttribution} attribution
      left join ${metaEventOutbox} purchase
        on purchase.order_id = attribution.order_id and purchase.event_name = 'Purchase'
      left join ${metaEventOutbox} orderconfirmed
        on orderconfirmed.order_id = attribution.order_id and orderconfirmed.event_name = 'orderconfirmed'
      left join ${orders} current_order on current_order.id = attribution.order_id
      where (${filters.startDate || null}::text is null or attribution.created_at::date >= ${filters.startDate || null})
        and (${filters.endDate || null}::text is null or attribution.created_at::date <= ${filters.endDate || null})
    `),
    db.select().from(metaWorkerHeartbeat)
      .where(eq(metaWorkerHeartbeat.workerKey, 'storefront-meta-worker'))
      .limit(1),
  ]);
  const coverage = coverageResult.rows[0] as {
    eligible_orders?: number | string;
    confirmed_orders?: number | string;
    orderconfirmed_orders?: number | string;
    purchase_orders?: number | string;
    negative_outcome_purchases?: number | string;
  } | undefined;

  return {
    eventRows: eventRows as MetaTrackedEventSummaryRow[],
    payloadRows: payloadRows as MetaTrackedEventLogRow[],
    health: {
      pending: statusRow?.pending ?? 0,
      retryable: statusRow?.retryable ?? 0,
      delivered: statusRow?.delivered ?? 0,
      failed: statusRow?.failed ?? 0,
      skipped: statusRow?.skipped ?? 0,
      oldestPendingAt: toIsoDateString(statusRow?.oldestPendingAt),
      eligibleOrders: Number(coverage?.eligible_orders ?? 0),
      confirmedOrders: Number(coverage?.confirmed_orders ?? 0),
      orderConfirmedOrders: Number(coverage?.orderconfirmed_orders ?? 0),
      purchaseOrders: Number(coverage?.purchase_orders ?? 0),
      negativeOutcomePurchases: Number(coverage?.negative_outcome_purchases ?? 0),
      workerLastHeartbeatAt: toIsoDateString(heartbeat?.lastHeartbeatAt),
    },
  };
}

function findColumnValue(row: Record<string, unknown>, possibleNames: string[]) {
  return possibleNames.find((name) => row[name] !== undefined)
    ? row[possibleNames.find((name) => row[name] !== undefined)!]
    : undefined;
}

function parseNumber(value: unknown) {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    if (value.includes('/')) {
      return Math.max(
        ...value.split('/').map((part) => {
          const cleaned = part.replace(/[^\d.-]/g, '');
          return Number.parseFloat(cleaned || '0');
        }),
      );
    }

    return Number.parseFloat(value.replace(/[^\d.-]/g, '') || '0');
  }

  return 0;
}

function parseDate(value: unknown) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'number') {
    const parsed = new Date((value - 25569) * 86400 * 1000);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : String(value ?? '').trim();
}

function toDateInput(value: Date) {
  return value.toISOString().slice(0, 10);
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function numberOrZero(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function valueFor(row: Record<string, unknown>, names: string[]) {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== null && row[name] !== '') {
      return row[name];
    }
  }

  return undefined;
}

function buildResolvedFilters(input: StatsFilters): Required<StatsFilters> {
  const today = new Date();
  const endDate = toDateInput(today);
  let startDate = input.startDate ?? '';

  if (input.range === '30d') {
    const start = new Date(today);
    start.setDate(today.getDate() - 29);
    startDate = toDateInput(start);
  }

  if (input.range === '90d') {
    const start = new Date(today);
    start.setDate(today.getDate() - 89);
    startDate = toDateInput(start);
  }

  if (input.range === 'year') {
    startDate = `${today.getUTCFullYear()}-01-01`;
  }

  if (input.range === 'all') {
    return {
      range: input.range,
      startDate: '',
      endDate: '',
    };
  }

  if (input.range === 'custom') {
    return {
      range: input.range,
      startDate: input.startDate ?? '',
      endDate: input.endDate ?? '',
    };
  }

  return {
    range: input.range,
    startDate,
    endDate,
  };
}

function getSnapshotKey(filters: Required<StatsFilters>) {
  return `${filters.range}:${filters.startDate || '*'}:${filters.endDate || '*'}`;
}

function getReportThroughDate(data: StatsDashboardData) {
  const candidates = [
    ...data.trends.daily.map((point) => point.bucket),
    ...data.trends.imports.map((point) => point.bucket),
  ].filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value));

  return candidates.length > 0 ? candidates.sort().at(-1)! : null;
}

function withSnapshotMeta(
  data: StatsDashboardData,
  row: typeof adminReportingSnapshots.$inferSelect,
): StatsDashboardData {
  return {
    ...data,
    filters: buildResolvedFilters(statsQuerySchema.parse({
      range: row.range as StatsFilters['range'],
      startDate: row.startDate ?? undefined,
      endDate: row.endDate ?? undefined,
    })),
    snapshot: {
      generatedAt: row.generatedAt.toISOString(),
      staleAt: row.staleAt.toISOString(),
      isStale: row.staleAt.getTime() < Date.now(),
      trigger: row.trigger,
      sourceImportBatchId: row.sourceImportBatchId,
      reportThroughDate: row.reportThroughDate,
    },
  };
}

function stripSnapshotMeta(data: StatsDashboardData) {
  const { snapshot: _snapshot, ...payload } = data;
  return payload;
}

async function readLatestStatsSnapshot(input: StatsFilters) {
  const db = getDb();
  const filters = buildResolvedFilters(statsQuerySchema.parse(input));
  const rows = await db
    .select()
    .from(adminReportingSnapshots)
    .where(eq(adminReportingSnapshots.snapshotKey, getSnapshotKey(filters)))
    .orderBy(desc(adminReportingSnapshots.generatedAt), desc(adminReportingSnapshots.id))
    .limit(1);
  const row = rows[0];

  return row ? withSnapshotMeta(row.payload as StatsDashboardData, row) : null;
}

function buildStatsWhere(filters: Required<StatsFilters>) {
  const conditions = [sql`${statsDateExpression} is not null`];

  if (filters.startDate) {
    conditions.push(sql`${statsDateExpression}::date >= ${filters.startDate}`);
  }

  if (filters.endDate) {
    conditions.push(sql`${statsDateExpression}::date <= ${filters.endDate}`);
  }

  return and(...conditions);
}

function buildAdCostWhere(filters: StatsFilters | Required<StatsFilters>) {
  const conditions = [];

  if (filters.startDate) {
    conditions.push(sql`${adCosts.date} >= ${filters.startDate}`);
  }

  if (filters.endDate) {
    conditions.push(sql`${adCosts.date} <= ${filters.endDate}`);
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

function buildAnalyticsWhere(filters: StatsFilters | Required<StatsFilters>) {
  const conditions = [];

  if (filters.startDate) {
    conditions.push(sql`${analyticsEvents.occurredAt}::date >= ${filters.startDate}`);
  }

  if (filters.endDate) {
    conditions.push(sql`${analyticsEvents.occurredAt}::date <= ${filters.endDate}`);
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

function emptyDashboard(filters: Required<StatsFilters>): StatsDashboardData {
  return {
    filters,
    summary: {
      totalOrders: 0,
      totalAmountCollected: 0,
      totalFees: 0,
      totalNetRevenue: 0,
      totalProductCost: 0,
      totalGrossProfit: 0,
      adSpend: 0,
      netProfitAfterAds: 0,
      averageOrderValue: 0,
      averageProfitPerOrder: 0,
      profitMargin: 0,
      profitMarginAfterAds: 0,
      fulfillmentRate: 0,
      matchedOrders: 0,
      totalConfirmedOrders: 0,
      profitableOrders: 0,
      unprofitableOrders: 0,
      breakEvenOrders: 0,
    },
    trends: {
      daily: [],
      weekly: [],
      monthly: [],
      imports: [],
    },
    feeBreakdown: {
      livraison: 0,
      poids: 0,
      extra: 0,
      sms: 0,
      stockage: 0,
      commission: 0,
      total: 0,
      avgPerOrder: 0,
    },
    adCosts: {
      totalSpend: 0,
      roas: 0,
      cpa: 0,
      cpc: 0,
      ctr: 0,
      conversionRate: 0,
    },
    metaAds: {
      events: [],
      recentPayloads: [],
    },
    wilayas: [],
    wilayaDetails: [],
    deliveries: [],
    topProducts: [],
    allProducts: [],
    topCategories: [],
    topBrands: [],
    profitability: [],
    importHistory: [],
    latestUnmatchedReferences: [],
    latestUnmatchedDetails: [],
    website: {
      sessions: 0,
      journeys: 0,
      pageViews: 0,
      productViews: 0,
      addToCarts: 0,
      checkoutStarts: 0,
      purchases: 0,
      searches: 0,
      zeroResultSearches: 0,
      sessionConversionRate: 0,
      viewToCartRate: 0,
      cartToPurchaseRate: 0,
      checkoutToPurchaseRate: 0,
      variants: [],
      topLandingPages: [],
      topSearches: [],
      funnel: [],
      topProducts: [],
    },
  };
}

export function parseSpreadsheet(buffer: Buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  if (!sheet) {
    return [];
  }

  const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1');
  let headerRow = range.s.r;

  for (let rowIndex = range.s.r; rowIndex <= Math.min(range.s.r + 6, range.e.r); rowIndex += 1) {
    const values = Array.from({ length: Math.min(6, range.e.c - range.s.c + 1) }).map((_, columnOffset) => {
      const cell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: range.s.c + columnOffset })];
      return String(cell?.v ?? '').toLowerCase();
    });

    if (values.some((value) => value.includes('référence') || value.includes('tracking') || value.includes('montant'))) {
      headerRow = rowIndex;
      break;
    }
  }

  range.s.r = headerRow;
  sheet['!ref'] = XLSX.utils.encode_range(range);

  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

  return rawRows.map((row) => ({
    encaisseLe: parseDate(findColumnValue(row, COLUMN_MAP.encaisseLe)),
    montant: parseNumber(findColumnValue(row, COLUMN_MAP.montant)),
    fraisLivraison: parseNumber(findColumnValue(row, COLUMN_MAP.fraisLivraison)),
    fraisPoids: parseNumber(findColumnValue(row, COLUMN_MAP.fraisPoids)),
    fraisExtra: parseNumber(findColumnValue(row, COLUMN_MAP.fraisExtra)),
    fraisSMS: parseNumber(findColumnValue(row, COLUMN_MAP.fraisSMS)),
    fraisStockage: parseNumber(findColumnValue(row, COLUMN_MAP.fraisStockage)),
    commissionRecouvrement: parseNumber(findColumnValue(row, COLUMN_MAP.commissionRecouvrement)),
    totalFraisService: parseNumber(findColumnValue(row, COLUMN_MAP.totalFraisService)),
    netRecouvret: parseNumber(findColumnValue(row, COLUMN_MAP.netRecouvret)),
    type: normalizeText(findColumnValue(row, COLUMN_MAP.type)),
    typePrestation: normalizeText(findColumnValue(row, COLUMN_MAP.typePrestation)),
    creeLe: parseDate(findColumnValue(row, COLUMN_MAP.creeLe)),
    tracking: normalizeText(findColumnValue(row, COLUMN_MAP.tracking)),
    reference: normalizeText(findColumnValue(row, COLUMN_MAP.reference)),
    destinataire: normalizeText(findColumnValue(row, COLUMN_MAP.destinataire)),
    telephone: normalizeText(findColumnValue(row, COLUMN_MAP.telephone)),
    commune: normalizeText(findColumnValue(row, COLUMN_MAP.commune)),
    wilaya: normalizeText(findColumnValue(row, COLUMN_MAP.wilaya)),
    produits: normalizeText(findColumnValue(row, COLUMN_MAP.produits)),
    remarque: normalizeText(findColumnValue(row, COLUMN_MAP.remarque)),
    poidsLivreLe: normalizeText(findColumnValue(row, COLUMN_MAP.poidsLivreLe)),
    encaisse: parseNumber(findColumnValue(row, COLUMN_MAP.encaisse)),
  }));
}

const DEFAULT_IMPORT_HISTORY_LIMIT = 8;
export const IMPORT_HISTORY_PAGE_SIZE = 10;

function mapImportHistoryRow(row: typeof importBatches.$inferSelect): ImportHistoryItem {
  const unmatchedCount = row.unmatchedReferences.length;

  return {
    id: row.id,
    batchId: row.batchId,
    fileName: row.fileName,
    importedAt: row.importedAt.toISOString(),
    totalRows: row.totalRows,
    matchedOrders: row.matchedOrders,
    skippedRows: Math.max(0, row.totalRows - row.matchedOrders - unmatchedCount),
    unmatchedCount,
    unmatchedReferences: row.unmatchedReferences,
    unmatchedDetails: row.unmatchedDetails,
    dateRangeStart: row.dateRangeStart,
    dateRangeEnd: row.dateRangeEnd,
  };
}

export async function listImportHistory(limit = DEFAULT_IMPORT_HISTORY_LIMIT) {
  applyServerCache({ stale: 60, revalidate: 300, expire: 3600 }, CACHE_TAGS.statsHistory, CACHE_TAGS.stats);

  const db = getDb();
  const rows = await db.select().from(importBatches).orderBy(desc(importBatches.importedAt)).limit(limit);

  return rows.map(mapImportHistoryRow);
}

export async function listImportHistoryPage({
  page,
  pageSize,
}: {
  page: number;
  pageSize: number;
}): Promise<ImportHistoryPage> {
  applyServerCache({ stale: 60, revalidate: 300, expire: 3600 }, CACHE_TAGS.statsHistory, CACHE_TAGS.stats);

  const db = getDb();
  const requestedPage = Math.max(1, page);
  const normalizedPageSize = Math.min(50, Math.max(1, pageSize));
  const [{ totalItems = 0 } = { totalItems: 0 }] = await db.select({ totalItems: count() }).from(importBatches);
  const totalPages = Math.max(1, Math.ceil(totalItems / normalizedPageSize));
  const normalizedPage = Math.min(requestedPage, totalPages);
  const rows = await db
    .select()
    .from(importBatches)
    .orderBy(desc(importBatches.importedAt))
    .limit(normalizedPageSize)
    .offset((normalizedPage - 1) * normalizedPageSize);

  return {
    items: rows.map(mapImportHistoryRow),
    page: normalizedPage,
    pageSize: normalizedPageSize,
    totalItems,
    totalPages,
  };
}

export async function computeStatsDashboard(input: StatsFilters) {
  applyServerCache({ stale: 60, revalidate: 300, expire: 1800 }, CACHE_TAGS.stats, CACHE_TAGS.statsHistory);

  const db = getDb();
  const filters = buildResolvedFilters(statsQuerySchema.parse(input));
  const where = buildStatsWhere(filters);
  const adWhere = buildAdCostWhere(filters);
  const analyticsWhere = buildAnalyticsWhere(filters);
  const websiteAnalyticsPromise = getWebsiteAnalyticsData(db, analyticsWhere);
  const metaAdsTrackingPromise = getMetaAdsTrackingData(db, filters);

  const [
    summaryRows,
    totalConfirmedOrderRows,
    dailyTrendRows,
    monthlyTrendRows,
    weeklyTrendRows,
    importTrendRows,
    wilayaRows,
    deliveryRows,
    productRows,
    importHistory,
    adSpendRows,
    allOrdersRows,
  ] = await Promise.all([
    db
      .select({
        totalOrders: sql<number>`count(*)::int`,
        totalAmountCollected: sql<number>`coalesce(sum(${processedOrders.amountCollected})::double precision, 0)`,
        totalFees: sql<number>`coalesce(sum(${processedOrders.totalFees})::double precision, 0)`,
        totalNetRevenue: sql<number>`coalesce(sum(${processedOrders.netRevenue})::double precision, 0)`,
        totalProductCost: sql<number>`coalesce(sum(${processedOrders.productCost})::double precision, 0)`,
        totalGrossProfit: sql<number>`coalesce(sum(${processedOrders.profit})::double precision, 0)`,
        feeLivraison: sql<number>`coalesce(sum(${processedOrders.feeLivraison})::double precision, 0)`,
        feePoids: sql<number>`coalesce(sum(${processedOrders.feePoids})::double precision, 0)`,
        feeExtra: sql<number>`coalesce(sum(${processedOrders.feeExtra})::double precision, 0)`,
        feeSms: sql<number>`coalesce(sum(${processedOrders.feeSms})::double precision, 0)`,
        feeStockage: sql<number>`coalesce(sum(${processedOrders.feeStockage})::double precision, 0)`,
        feeCommission: sql<number>`coalesce(sum(${processedOrders.feeCommission})::double precision, 0)`,
        profitableOrders: sql<number>`count(*) filter (where ${processedOrders.profit} > 0)::int`,
        unprofitableOrders: sql<number>`count(*) filter (where ${processedOrders.profit} < 0)::int`,
        breakEvenOrders: sql<number>`count(*) filter (where ${processedOrders.profit} = 0)::int`,
      })
      .from(processedOrders)
      .where(where),
    db
      .select({
        totalConfirmedOrders: sql<number>`count(*)::int`,
      })
      .from(orders)
      .where(inArray(orders.confirmed, [2, 3, 4, 5, 10])),
    db
      .select({
        bucket: sql<string>`to_char(date_trunc('day', ${statsDateExpression}), 'YYYY-MM-DD')`,
        orders: sql<number>`count(*)::int`,
        revenue: sql<number>`coalesce(sum(${processedOrders.netRevenue})::double precision, 0)`,
        profit: sql<number>`coalesce(sum(${processedOrders.profit})::double precision, 0)`,
        fees: sql<number>`coalesce(sum(${processedOrders.totalFees})::double precision, 0)`,
      })
      .from(processedOrders)
      .where(where)
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db
      .select({
        bucket: sql<string>`to_char(date_trunc('month', ${statsDateExpression}), 'YYYY-MM')`,
        orders: sql<number>`count(*)::int`,
        revenue: sql<number>`coalesce(sum(${processedOrders.netRevenue})::double precision, 0)`,
        profit: sql<number>`coalesce(sum(${processedOrders.profit})::double precision, 0)`,
        fees: sql<number>`coalesce(sum(${processedOrders.totalFees})::double precision, 0)`,
      })
      .from(processedOrders)
      .where(where)
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db
      .select({
        bucket: sql<string>`to_char(date_trunc('week', ${statsDateExpression}), 'YYYY-MM-DD')`,
        orders: sql<number>`count(*)::int`,
        revenue: sql<number>`coalesce(sum(${processedOrders.netRevenue})::double precision, 0)`,
        profit: sql<number>`coalesce(sum(${processedOrders.profit})::double precision, 0)`,
        fees: sql<number>`coalesce(sum(${processedOrders.totalFees})::double precision, 0)`,
      })
      .from(processedOrders)
      .where(where)
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db
      .select({
        bucket: sql<string>`to_char(date_trunc('day', ${processedOrders.importedAt}), 'YYYY-MM-DD')`,
        orders: sql<number>`count(*)::int`,
        revenue: sql<number>`coalesce(sum(${processedOrders.netRevenue})::double precision, 0)`,
        profit: sql<number>`coalesce(sum(${processedOrders.profit})::double precision, 0)`,
        fees: sql<number>`coalesce(sum(${processedOrders.totalFees})::double precision, 0)`,
      })
      .from(processedOrders)
      .where(where)
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db
      .select({
        name: sql<string>`coalesce(nullif(${processedOrders.wilaya}, ''), 'Unknown')`,
        orders: sql<number>`count(*)::int`,
        collected: sql<number>`coalesce(sum(${processedOrders.amountCollected})::double precision, 0)`,
        revenue: sql<number>`coalesce(sum(${processedOrders.netRevenue})::double precision, 0)`,
        profit: sql<number>`coalesce(sum(${processedOrders.profit})::double precision, 0)`,
        fees: sql<number>`coalesce(sum(${processedOrders.totalFees})::double precision, 0)`,
      })
      .from(processedOrders)
      .where(where)
      .groupBy(sql`1`)
      .orderBy(sql`3 desc`)
      .limit(8),
    db
      .select({
        name: sql<string>`coalesce(nullif(${processedOrders.deliveryType}, ''), 'Unknown')`,
        orders: sql<number>`count(*)::int`,
        collected: sql<number>`coalesce(sum(${processedOrders.amountCollected})::double precision, 0)`,
        revenue: sql<number>`coalesce(sum(${processedOrders.amountCollected})::double precision, 0)`,
        fees: sql<number>`coalesce(sum(${processedOrders.totalFees})::double precision, 0)`,
        netRevenue: sql<number>`coalesce(sum(${processedOrders.netRevenue})::double precision, 0)`,
        profit: sql<number>`coalesce(sum(${processedOrders.profit})::double precision, 0)`,
      })
      .from(processedOrders)
      .where(where)
      .groupBy(sql`1`)
      .orderBy(sql`2 desc`),
    db
      .select({
        productId: processedOrderProducts.productId,
        title: processedOrderProducts.title,
        sku: processedOrderProducts.sku,
        price: sql<number>`coalesce(${processedOrderProducts.price}, 0)::double precision`,
        cost: sql<number>`coalesce(${processedOrderProducts.cost}, 0)::double precision`,
        categoryName: processedOrderProducts.categoryName,
        brandName: processedOrderProducts.brandName,
        categoryId: processedOrderProducts.categoryId,
        brandId: processedOrderProducts.brandId,
      })
      .from(processedOrders)
      .innerJoin(processedOrderProducts, eq(processedOrders.id, processedOrderProducts.processedOrderId))
      .where(where),
    listImportHistory(),
    db
      .select({
        spend: sql<number>`coalesce(sum(${adCosts.spend})::double precision, 0)`,
        impressions: sql<number>`coalesce(sum(${adCosts.impressions})::int, 0)`,
        clicks: sql<number>`coalesce(sum(${adCosts.clicks})::int, 0)`,
        conversions: sql<number>`coalesce(sum(${adCosts.conversions})::int, 0)`,
      })
      .from(adCosts)
      .where(adWhere),
    db.select({ cartProducts: orders.cartProducts, confirmed: orders.confirmed }).from(orders),
  ]);
  const {
    websiteSummaryRows,
    websiteVariantRows,
    websiteLandingRows,
    websiteSearchRows,
    websiteTopProductRows,
    websiteMetricRows,
  } = await websiteAnalyticsPromise;
  const {
    eventRows: metaEventRows,
    payloadRows: metaPayloadRows,
    health: metaHealth,
  } = await metaAdsTrackingPromise;

  const summaryRow = summaryRows[0];
  const adSummary = adSpendRows[0];
  const websiteSummary = websiteSummaryRows[0];
  const adSpend = round(numberOrZero(adSummary?.spend));
  const totalConfirmedOrders = totalConfirmedOrderRows[0]?.totalConfirmedOrders ?? 0;
  const websiteProductMetricsById = new Map(
    websiteMetricRows.map((row) => [
      String(row.id),
      {
        viewCount: row.viewCount,
        addToCartCount: row.addToCartCount,
        checkoutCount: row.checkoutCount,
        websitePurchaseCount: row.websitePurchaseCount,
        popularityScore: round(numberOrZero(row.popularityScore)),
        websiteConversionRate: round(numberOrZero(row.websiteConversionRate) * 100),
      },
    ]),
  );
  const website = {
    sessions: websiteSummary?.sessions ?? 0,
    journeys: websiteSummary?.journeys ?? 0,
    pageViews: websiteSummary?.pageViews ?? 0,
    productViews: websiteSummary?.productViews ?? 0,
    addToCarts: websiteSummary?.addToCarts ?? 0,
    checkoutStarts: websiteSummary?.checkoutStarts ?? 0,
    purchases: websiteSummary?.purchases ?? 0,
    searches: websiteSummary?.searches ?? 0,
    zeroResultSearches: websiteSummary?.zeroResultSearches ?? 0,
    sessionConversionRate: websiteSummary?.sessions ? round(((websiteSummary?.purchases ?? 0) / websiteSummary.sessions) * 100) : 0,
    viewToCartRate: websiteSummary?.productViews ? round(((websiteSummary?.addToCarts ?? 0) / websiteSummary.productViews) * 100) : 0,
    cartToPurchaseRate: websiteSummary?.addToCarts ? round(((websiteSummary?.purchases ?? 0) / websiteSummary.addToCarts) * 100) : 0,
    checkoutToPurchaseRate: websiteSummary?.checkoutStarts ? round(((websiteSummary?.purchases ?? 0) / websiteSummary.checkoutStarts) * 100) : 0,
    variants: websiteVariantRows.map((row) => ({
      variant: row.variant,
      sessions: row.sessions,
      pageViews: row.pageViews,
      productViews: row.productViews,
      addToCarts: row.addToCarts,
      checkoutStarts: row.checkoutStarts,
      purchases: row.purchases,
      sessionConversionRate: row.sessions ? round((row.purchases / row.sessions) * 100) : 0,
      cartToPurchaseRate: row.addToCarts ? round((row.purchases / row.addToCarts) * 100) : 0,
      checkoutToPurchaseRate: row.checkoutStarts ? round((row.purchases / row.checkoutStarts) * 100) : 0,
    })),
    topLandingPages: websiteLandingRows.map((row) => ({
      path: row.path,
      sessions: row.sessions,
    })),
    topSearches: websiteSearchRows.map((row) => ({
      term: row.term,
      searches: row.searches,
      zeroResults: row.zeroResults,
    })),
    funnel: [
      { name: 'Sessions', value: websiteSummary?.sessions ?? 0 },
      { name: 'Product views', value: websiteSummary?.productViews ?? 0 },
      { name: 'Adds to cart', value: websiteSummary?.addToCarts ?? 0 },
      { name: 'Checkout starts', value: websiteSummary?.checkoutStarts ?? 0 },
      { name: 'Purchases', value: websiteSummary?.purchases ?? 0 },
    ].filter((item) => item.value > 0),
    topProducts: websiteTopProductRows.map((row) => ({
      id: String(row.id),
      title: row.title,
      unitsSold: 0,
      revenue: 0,
      cost: 0,
      profit: 0,
      margin: 0,
      sku: row.sku,
      categoryName: row.categoryName,
      brandName: row.brandName,
      viewCount: row.viewCount,
      addToCartCount: row.addToCartCount,
      checkoutCount: row.checkoutCount,
      websitePurchaseCount: row.websitePurchaseCount,
      popularityScore: round(numberOrZero(row.popularityScore)),
      websiteConversionRate: round(numberOrZero(row.websiteConversionRate) * 100),
    })),
  };
  const metaAds = {
    events: metaEventRows.map((row) => ({
      name: row.name,
      total: row.total,
      pixelFired: row.pixelFired,
      capiSent: row.capiSent,
      capiDelivered: row.capiDelivered,
      capiFailed: row.capiFailed,
      lastOccurredAt: toIsoDateString(row.lastOccurredAt),
    })),
    recentPayloads: metaPayloadRows.map((row) => ({
      eventId: row.eventId,
      analyticsEventName: row.analyticsEventName,
      metaEventName: row.metaEventName,
      pagePath: row.pagePath,
      occurredAt: toIsoDateString(row.occurredAt) ?? new Date(0).toISOString(),
      pixelPayload: row.pixelPayload,
      capiPayload: row.capiPayload,
      capiStatus: row.capiStatus,
      capiOk: row.capiOk,
    })),
    health: metaHealth,
  };

  if (!summaryRow || summaryRow.totalOrders === 0) {
    const data = emptyDashboard(filters);
    data.importHistory = importHistory;
    data.latestUnmatchedReferences = importHistory[0]?.unmatchedReferences.slice(0, 8) ?? [];
    data.latestUnmatchedDetails = (importHistory[0]?.unmatchedDetails ?? []).slice(0, 8).map((item) => ({
      ...item,
      batchId: importHistory[0]!.batchId,
    }));
    data.website = website;
    data.metaAds = metaAds;
    return data;
  }

  const productMap = new Map<string, ProductPerformance>();
  const categoryMap = new Map<string, ProductPerformance>();
  const brandMap = new Map<string, ProductPerformance>();
  const orderCountsByProduct = new Map<string, { total: number; confirmed: number }>();
  const cartProductReferences = collectCartProductReferenceBuckets(allOrdersRows);
  const orderLookupRows = cartProductReferences.productIds.length === 0 && cartProductReferences.mongoIds.length === 0
    ? []
    : await db
      .select({
        id: products.id,
        mongoId: products.mongoId,
      })
      .from(products)
      .where(or(
        ...(cartProductReferences.productIds.length > 0 ? [inArray(products.id, cartProductReferences.productIds)] : []),
        ...(cartProductReferences.mongoIds.length > 0 ? [inArray(products.mongoId, cartProductReferences.mongoIds)] : []),
      ));
  const orderProductLookup = buildCartProductLookup(orderLookupRows);

  for (const order of allOrdersRows) {
    const uniqueProducts = [...new Set(
      (order.cartProducts ?? [])
        .map((value) => getCartProductLookupKey(value))
        .filter((value): value is string => Boolean(value))
        .map((lookupKey) => orderProductLookup.get(lookupKey))
        .filter((value): value is NonNullable<typeof value> => Boolean(value))
        .map((product) => String(product.id)),
    )];
    for (const productId of uniqueProducts) {
      const entry = orderCountsByProduct.get(productId) ?? { total: 0, confirmed: 0 };
      entry.total += 1;
      if (isConfirmedLifecycleStatus(coerceOrderStatus(order.confirmed))) {
        entry.confirmed += 1;
      }
      orderCountsByProduct.set(productId, entry);
    }
  }

  for (const row of productRows) {
    const productId = row.productId ?? row.title ?? 'unknown-product';
    const productKey = String(productId);
    const categoryKey = row.categoryId ?? row.categoryName ?? 'uncategorized';
    const brandKey = row.brandId ?? row.brandName ?? 'unbranded';
    const itemProfit = numberOrZero(row.price) - numberOrZero(row.cost);

    const currentProduct = productMap.get(productKey) ?? {
      id: productKey,
      title: row.title ?? 'Untitled product',
      unitsSold: 0,
      revenue: 0,
      cost: 0,
      profit: 0,
      margin: 0,
      sku: row.sku,
      categoryName: row.categoryName,
      brandName: row.brandName,
    };

    currentProduct.unitsSold += 1;
    currentProduct.revenue += numberOrZero(row.price);
    currentProduct.cost += numberOrZero(row.cost);
    currentProduct.profit += itemProfit;
    productMap.set(productKey, currentProduct);

    const currentCategory = categoryMap.get(String(categoryKey)) ?? {
      id: String(categoryKey),
      title: row.categoryName ?? 'Uncategorized',
      unitsSold: 0,
      revenue: 0,
      cost: 0,
      profit: 0,
      margin: 0,
      sku: null,
      categoryName: row.categoryName,
      brandName: null,
    };

    currentCategory.unitsSold += 1;
    currentCategory.revenue += numberOrZero(row.price);
    currentCategory.cost += numberOrZero(row.cost);
    currentCategory.profit += itemProfit;
    categoryMap.set(String(categoryKey), currentCategory);

    const currentBrand = brandMap.get(String(brandKey)) ?? {
      id: String(brandKey),
      title: row.brandName ?? 'Unbranded',
      unitsSold: 0,
      revenue: 0,
      cost: 0,
      profit: 0,
      margin: 0,
      sku: null,
      categoryName: null,
      brandName: row.brandName,
    };

    currentBrand.unitsSold += 1;
    currentBrand.revenue += numberOrZero(row.price);
    currentBrand.cost += numberOrZero(row.cost);
    currentBrand.profit += itemProfit;
    brandMap.set(String(brandKey), currentBrand);
  }

  const enrichPerformance = (items: ProductPerformance[]) =>
    items
      .map((item) => ({
        ...item,
        revenue: round(item.revenue),
        cost: round(item.cost),
        profit: round(item.profit),
        margin: item.revenue > 0 ? round((item.profit / item.revenue) * 100) : 0,
        totalOrderCount: item.totalOrderCount,
        confirmedOrderCount: item.confirmedOrderCount,
        confirmationRate: item.totalOrderCount && item.totalOrderCount > 10
          ? round(((item.confirmedOrderCount ?? 0) / item.totalOrderCount) * 100)
          : null,
      }))
      .sort((left, right) => right.profit - left.profit)
      .slice(0, 8);

  const allProducts = Array.from(productMap.values())
    .map((item) => {
      const counts = orderCountsByProduct.get(item.id);
      const websiteMetrics = websiteProductMetricsById.get(item.id);
      return {
        ...item,
        revenue: round(item.revenue),
        cost: round(item.cost),
        profit: round(item.profit),
        margin: item.revenue > 0 ? round((item.profit / item.revenue) * 100) : 0,
        totalOrderCount: counts?.total ?? 0,
        confirmedOrderCount: counts?.confirmed ?? 0,
        confirmationRate: counts && counts.total > 10 ? round((counts.confirmed / counts.total) * 100) : null,
        viewCount: websiteMetrics?.viewCount ?? 0,
        addToCartCount: websiteMetrics?.addToCartCount ?? 0,
        checkoutCount: websiteMetrics?.checkoutCount ?? 0,
        websitePurchaseCount: websiteMetrics?.websitePurchaseCount ?? 0,
        popularityScore: websiteMetrics?.popularityScore ?? 0,
        websiteConversionRate: websiteMetrics?.websiteConversionRate ?? 0,
      };
    })
    .sort((left, right) => right.unitsSold - left.unitsSold);

  const totalGrossProfit = round(numberOrZero(summaryRow.totalGrossProfit));
  const totalNetRevenue = round(numberOrZero(summaryRow.totalNetRevenue));
  const totalOrders = summaryRow.totalOrders;
  const netProfitAfterAds = round(totalGrossProfit - adSpend);

  return {
    filters,
    summary: {
      totalOrders,
      totalAmountCollected: round(numberOrZero(summaryRow.totalAmountCollected)),
      totalFees: round(numberOrZero(summaryRow.totalFees)),
      totalNetRevenue,
      totalProductCost: round(numberOrZero(summaryRow.totalProductCost)),
      totalGrossProfit,
      adSpend,
      netProfitAfterAds,
      averageOrderValue: totalOrders > 0 ? round(numberOrZero(summaryRow.totalAmountCollected) / totalOrders) : 0,
      averageProfitPerOrder: totalOrders > 0 ? round(totalGrossProfit / totalOrders) : 0,
      profitMargin: totalNetRevenue > 0 ? round((totalGrossProfit / totalNetRevenue) * 100) : 0,
      profitMarginAfterAds: totalNetRevenue > 0 ? round((netProfitAfterAds / totalNetRevenue) * 100) : 0,
      fulfillmentRate: totalConfirmedOrders > 0 ? round((totalOrders / totalConfirmedOrders) * 100) : 0,
      matchedOrders: totalOrders,
      totalConfirmedOrders,
      profitableOrders: summaryRow.profitableOrders,
      unprofitableOrders: summaryRow.unprofitableOrders,
      breakEvenOrders: summaryRow.breakEvenOrders,
    },
    trends: {
      daily: dailyTrendRows.map((row) => ({
        bucket: row.bucket,
        orders: row.orders,
        revenue: round(numberOrZero(row.revenue)),
        profit: round(numberOrZero(row.profit)),
        fees: round(numberOrZero(row.fees)),
      })),
      weekly: weeklyTrendRows.map((row) => ({
        bucket: row.bucket,
        orders: row.orders,
        revenue: round(numberOrZero(row.revenue)),
        profit: round(numberOrZero(row.profit)),
        fees: round(numberOrZero(row.fees)),
      })),
      monthly: monthlyTrendRows.map((row) => ({
        bucket: row.bucket,
        orders: row.orders,
        revenue: round(numberOrZero(row.revenue)),
        profit: round(numberOrZero(row.profit)),
        fees: round(numberOrZero(row.fees)),
      })),
      imports: importTrendRows.map((row) => ({
        bucket: row.bucket,
        orders: row.orders,
        revenue: round(numberOrZero(row.revenue)),
        profit: round(numberOrZero(row.profit)),
        fees: round(numberOrZero(row.fees)),
      })),
    },
    feeBreakdown: {
      livraison: round(numberOrZero(summaryRow.feeLivraison)),
      poids: round(numberOrZero(summaryRow.feePoids)),
      extra: round(numberOrZero(summaryRow.feeExtra)),
      sms: round(numberOrZero(summaryRow.feeSms)),
      stockage: round(numberOrZero(summaryRow.feeStockage)),
      commission: round(numberOrZero(summaryRow.feeCommission)),
      total: round(numberOrZero(summaryRow.totalFees)),
      avgPerOrder: totalOrders > 0 ? round(numberOrZero(summaryRow.totalFees) / totalOrders) : 0,
    },
    adCosts: {
      totalSpend: adSpend,
      roas: adSpend > 0 ? round(totalNetRevenue / adSpend) : 0,
      cpa: totalOrders > 0 ? round(adSpend / totalOrders) : 0,
      cpc: numberOrZero(adSummary?.clicks) > 0 ? round(adSpend / numberOrZero(adSummary?.clicks)) : 0,
      ctr: numberOrZero(adSummary?.impressions) > 0 ? round((numberOrZero(adSummary?.clicks) / numberOrZero(adSummary?.impressions)) * 100) : 0,
      conversionRate: numberOrZero(adSummary?.clicks) > 0 ? round((numberOrZero(adSummary?.conversions) / numberOrZero(adSummary?.clicks)) * 100) : 0,
    },
    metaAds,
    wilayas: wilayaRows.map((row) => ({
      name: row.name,
      orders: row.orders,
      revenue: round(numberOrZero(row.revenue)),
      profit: round(numberOrZero(row.profit)),
    })),
    wilayaDetails: wilayaRows
      .map((row) => ({
        name: row.name,
        orders: row.orders,
        collected: round(numberOrZero(row.collected)),
        fees: round(numberOrZero(row.fees)),
        revenue: round(numberOrZero(row.revenue)),
        profit: round(numberOrZero(row.profit)),
        avgOrder: row.orders > 0 ? round(numberOrZero(row.revenue) / row.orders) : 0,
      }))
      .sort((left, right) => right.orders - left.orders),
    deliveries: deliveryRows.map((row) => ({
      name: row.name,
      orders: row.orders,
      revenue: round(numberOrZero(row.revenue)),
      collected: round(numberOrZero(row.collected)),
      profit: round(numberOrZero(row.profit)),
      fees: round(numberOrZero(row.fees)),
      netRevenue: round(numberOrZero(row.netRevenue)),
    })),
    topProducts: enrichPerformance(
      Array.from(productMap.values()).map((item) => {
        const counts = orderCountsByProduct.get(item.id);
        return {
          ...item,
          totalOrderCount: counts?.total ?? 0,
          confirmedOrderCount: counts?.confirmed ?? 0,
        };
      }),
    ),
    allProducts,
    topCategories: enrichPerformance(Array.from(categoryMap.values())),
    topBrands: enrichPerformance(Array.from(brandMap.values())),
    profitability: [
      { name: 'Profitable', value: summaryRow.profitableOrders, fill: 'var(--chart-2)' },
      { name: 'Break-even', value: summaryRow.breakEvenOrders, fill: 'var(--chart-4)' },
      { name: 'Loss-making', value: summaryRow.unprofitableOrders, fill: 'var(--chart-5)' },
    ].filter((item) => item.value > 0),
    importHistory,
    latestUnmatchedReferences: importHistory[0]?.unmatchedReferences.slice(0, 8) ?? [],
    latestUnmatchedDetails: (importHistory[0]?.unmatchedDetails ?? []).slice(0, 8).map((item) => ({
      ...item,
      batchId: importHistory[0]!.batchId,
    })),
    website,
  };
}

export async function getStatsDashboard(input: StatsFilters) {
  applyServerCache({ stale: 60, revalidate: 300, expire: 1800 }, CACHE_TAGS.stats, CACHE_TAGS.statsHistory);

  const snapshot = await readLatestStatsSnapshot(input);
  if (snapshot) {
    return snapshot;
  }

  const data = await computeStatsDashboard(input);
  await writeAdminReportingSnapshot({
    runId: `bootstrap-${crypto.randomUUID()}`,
    trigger: 'bootstrap-request',
    data,
  });
  return readLatestStatsSnapshot(input) ?? data;
}

export async function refreshStatsDashboard(input: StatsFilters, trigger = 'manual-refresh') {
  const data = await computeStatsDashboard(input);
  await writeAdminReportingSnapshot({
    runId: `${trigger}-${crypto.randomUUID()}`,
    trigger,
    data,
  });

  return readLatestStatsSnapshot(input) ?? data;
}

async function writeAdminReportingSnapshot({
  runId,
  trigger,
  sourceImportBatchId = null,
  data,
}: {
  runId: string;
  trigger: string;
  sourceImportBatchId?: string | null;
  data: StatsDashboardData;
}) {
  const db = getDb();
  const filters = buildResolvedFilters(data.filters);
  const now = new Date();
  const staleAt = new Date(now.getTime() + ADMIN_REPORTING_STALE_AFTER_MS);
  await db
    .insert(adminReportingSnapshots)
    .values({
      snapshotKey: getSnapshotKey(filters),
      runId,
      trigger,
      sourceImportBatchId,
      range: filters.range,
      startDate: filters.startDate || null,
      endDate: filters.endDate || null,
      reportThroughDate: getReportThroughDate(data),
      payload: stripSnapshotMeta(data),
      generatedAt: now,
      staleAt,
    })
    .onConflictDoUpdate({
      target: [adminReportingSnapshots.snapshotKey, adminReportingSnapshots.runId],
      set: {
        trigger,
        sourceImportBatchId,
        range: filters.range,
        startDate: filters.startDate || null,
        endDate: filters.endDate || null,
        reportThroughDate: getReportThroughDate(data),
        payload: stripSnapshotMeta(data),
        generatedAt: now,
        staleAt,
      },
    });
}

export async function refreshAdminReportingSnapshots({
  runId = crypto.randomUUID(),
  trigger,
  sourceImportBatchId = null,
}: {
  runId?: string;
  trigger: string;
  sourceImportBatchId?: string | null;
}) {
  const db = getDb();
  const startedAt = new Date();

  await db
    .insert(adminReportingSnapshotRuns)
    .values({
      runId,
      trigger,
      sourceImportBatchId,
      status: 'running',
      startedAt,
      updatedAt: startedAt,
    })
    .onConflictDoUpdate({
      target: adminReportingSnapshotRuns.runId,
      set: {
        trigger,
        sourceImportBatchId,
        status: 'running',
        startedAt,
        updatedAt: startedAt,
        errorMessage: null,
      },
    });

  try {
    let built = 0;
    for (const input of ADMIN_REPORTING_STANDARD_INPUTS) {
      const data = await computeStatsDashboard(input);
      await writeAdminReportingSnapshot({
        runId,
        trigger,
        sourceImportBatchId,
        data,
      });
      built += 1;
    }

    const completedAt = new Date();
    await db
      .update(adminReportingSnapshotRuns)
      .set({
        status: 'completed',
        completedAt,
        updatedAt: completedAt,
        errorMessage: null,
      })
      .where(eq(adminReportingSnapshotRuns.runId, runId));

    return {
      runId,
      trigger,
      sourceImportBatchId,
      snapshots: built,
    };
  } catch (error) {
    const failedAt = new Date();
    await db
      .update(adminReportingSnapshotRuns)
      .set({
        status: 'failed',
        completedAt: failedAt,
        updatedAt: failedAt,
        errorMessage: error instanceof Error ? error.message : 'Unknown reporting refresh failure',
      })
      .where(eq(adminReportingSnapshotRuns.runId, runId));
    throw error;
  }
}

export async function importStatsSpreadsheet(buffer: Buffer, fileName: string): Promise<StatsImportResult> {
  const db = getDb();
  const rows = parseSpreadsheet(buffer).filter((row) => row.reference || row.tracking);
  const batchId = crypto.randomUUID();

  const references = [...new Set(rows.map((row) => row.reference).filter(Boolean))];
  const trackings = [...new Set(rows.map((row) => row.tracking).filter(Boolean))];
  const numericReferences = references
    .filter(isNumericOrderReference)
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value));

  const [candidateOrders, existingRows] = await Promise.all([
    numericReferences.length > 0
      ? db.select().from(orders).where(inArray(orders.id, numericReferences))
      : Promise.resolve([]),
    trackings.length > 0
      ? db.select({ tracking: processedOrders.tracking }).from(processedOrders).where(inArray(processedOrders.tracking, trackings))
      : Promise.resolve([]),
  ]);

  const cartProductReferences = collectCartProductReferenceBuckets(candidateOrders);

  const productRows = cartProductReferences.productIds.length === 0 && cartProductReferences.mongoIds.length === 0
    ? []
    : await db
      .select({
        id: products.id,
        mongoId: products.mongoId,
        title: products.title,
        sku: products.sku,
        price: sql<number>`coalesce(${products.price}, 0)::double precision`,
        cost: sql<number>`coalesce(${products.purchasePrice}, 0)::double precision`,
        brandId: products.brandId,
        brandName: brands.name,
        categoryId: products.categoryId,
        categoryName: categories.name,
      })
      .from(products)
      .leftJoin(brands, eq(products.brandId, brands.id))
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(or(
        ...(cartProductReferences.productIds.length > 0 ? [inArray(products.id, cartProductReferences.productIds)] : []),
        ...(cartProductReferences.mongoIds.length > 0 ? [inArray(products.mongoId, cartProductReferences.mongoIds)] : []),
      ));

  const orderById = new Map(candidateOrders.map((order) => [String(order.id), order]));
  const productLookup = buildCartProductLookup(productRows);
  const existingTrackings = new Set(existingRows.map((row) => row.tracking));

  let duplicateOrders = 0;
  const unmatchedReferences: string[] = [];
  const unmatchedDetails: UnmatchedImportRow[] = [];
  const processedOrderValues: Array<typeof processedOrders.$inferInsert> = [];
  const processedProductValuesByTracking = new Map<string, Array<typeof processedOrderProducts.$inferInsert>>();

  for (const row of rows) {
    if (!row.tracking || existingTrackings.has(row.tracking)) {
      duplicateOrders += 1;
      continue;
    }

    const matchedOrder = isNumericOrderReference(row.reference) ? orderById.get(row.reference.trim()) : null;

    if (!matchedOrder) {
      unmatchedReferences.push(row.reference || row.tracking);
      unmatchedDetails.push({
        reference: row.reference,
        tracking: row.tracking,
        customerName: row.destinataire,
        phone: row.telephone,
        wilaya: row.wilaya,
        commune: row.commune,
        amountCollected: amountCollectedFromRow(row),
        products: row.produits,
        note: row.remarque,
      });
      continue;
    }

    const matchedProducts = matchedOrder.cartProducts
      .map((value) => getCartProductLookupKey(value))
      .filter((value): value is string => Boolean(value))
      .map((lookupKey) => productLookup.get(lookupKey))
      .filter((value): value is NonNullable<typeof value> => Boolean(value));

    const productCost = matchedProducts.reduce((sum, product) => sum + numberOrZero(product.cost), 0);
    const totalFees = row.totalFraisService > 0
      ? row.totalFraisService
      : row.fraisLivraison + row.fraisPoids + row.fraisExtra + row.fraisSMS + row.fraisStockage + row.commissionRecouvrement;
    const amountCollected = row.encaisse > 0 ? row.encaisse : row.montant;
    const netRevenue = row.netRecouvret > 0 ? row.netRecouvret : amountCollected - totalFees;
    const profit = netRevenue - productCost;

    processedOrderValues.push({
      orderId: String(matchedOrder.id),
      tracking: row.tracking,
      customerName: row.destinataire || [matchedOrder.firstName, matchedOrder.lastName].filter(Boolean).join(' '),
      wilaya: row.wilaya || String(matchedOrder.state || ''),
      commune: row.commune || matchedOrder.city || '',
      deliveryType: row.typePrestation || row.type || String(matchedOrder.delivery || ''),
      amountCollected: amountCollected.toFixed(2),
      totalFees: totalFees.toFixed(2),
      netRevenue: netRevenue.toFixed(2),
      productCost: productCost.toFixed(2),
      profit: profit.toFixed(2),
      feeLivraison: row.fraisLivraison.toFixed(2),
      feePoids: row.fraisPoids.toFixed(2),
      feeExtra: row.fraisExtra.toFixed(2),
      feeSms: row.fraisSMS.toFixed(2),
      feeStockage: row.fraisStockage.toFixed(2),
      feeCommission: row.commissionRecouvrement.toFixed(2),
      deliveredAt: row.encaisseLe,
      orderCreatedAt: matchedOrder.createdAt,
      encaissedAt: row.encaisseLe ?? row.creeLe,
      importBatchId: batchId,
    });

    processedProductValuesByTracking.set(
      row.tracking,
      matchedProducts.map((product) => ({
        processedOrderId: 0,
        productId: String(product.id),
        title: product.title,
        price: numberOrZero(product.price).toFixed(2),
        cost: numberOrZero(product.cost).toFixed(2),
        sku: product.sku,
        categoryId: product.categoryId ? String(product.categoryId) : null,
        categoryName: product.categoryName,
        brandId: product.brandId ? String(product.brandId) : null,
        brandName: product.brandName,
      })),
    );

    existingTrackings.add(row.tracking);
  }

  const importedAt = new Date();
  const importedRangeValues = processedOrderValues
    .map((row) => row.encaissedAt ?? row.orderCreatedAt)
    .filter((value): value is Date => value instanceof Date);
  const dateRangeStart = importedRangeValues.length > 0 ? toDateInput(new Date(Math.min(...importedRangeValues.map((value) => value.getTime())))) : null;
  const dateRangeEnd = importedRangeValues.length > 0 ? toDateInput(new Date(Math.max(...importedRangeValues.map((value) => value.getTime())))) : null;

  await db.transaction(async (tx) => {
    await tx.insert(importBatches).values({
      batchId,
      fileName,
      importedAt,
      totalRows: rows.length,
      matchedOrders: processedOrderValues.length,
      unmatchedReferences,
      unmatchedDetails,
      dateRangeStart,
      dateRangeEnd,
    });

    if (processedOrderValues.length === 0) {
      return;
    }

    const insertedOrders = await tx
      .insert(processedOrders)
      .values(processedOrderValues)
      .returning({ id: processedOrders.id, tracking: processedOrders.tracking });

    const childRows = insertedOrders.flatMap((insertedOrder) =>
      (processedProductValuesByTracking.get(insertedOrder.tracking) ?? []).map((row) => ({
        ...row,
        processedOrderId: insertedOrder.id,
      })),
    );

    if (childRows.length > 0) {
      await tx.insert(processedOrderProducts).values(childRows);
    }
  });

  const stats = await computeStatsDashboard({ range: '90d' });

  return {
    batchId,
    newOrders: processedOrderValues.length,
    duplicateOrders,
    unmatchedReferences,
    stats,
  };
}

export async function deleteImportBatch(batchId: string) {
  const db = getDb();

  const deletedRows = await db.transaction(async (tx) => {
    const deletedOrders = await tx
      .delete(processedOrders)
      .where(eq(processedOrders.importBatchId, batchId))
      .returning({ id: processedOrders.id });

    const deletedBatch = await tx
      .delete(importBatches)
      .where(eq(importBatches.batchId, batchId))
      .returning({ id: importBatches.id });

    return {
      deletedOrders: deletedOrders.length,
      deletedBatch: deletedBatch[0] ?? null,
    };
  });

  return deletedRows;
}

export async function dismissUnmatchedReference(batchId: string, reference: string) {
  const db = getDb();
  const batch = await db.select().from(importBatches).where(eq(importBatches.batchId, batchId)).limit(1);
  const row = batch[0];

  if (!row) {
    return null;
  }

  const nextReferences = row.unmatchedReferences.filter((item) => item !== reference);
  const nextDetails = row.unmatchedDetails.filter((item) => item.reference !== reference && item.tracking !== reference);

  await db
    .update(importBatches)
    .set({
      unmatchedReferences: nextReferences,
      unmatchedDetails: nextDetails,
      updatedAt: new Date(),
    })
    .where(eq(importBatches.batchId, batchId));

  return {
    batchId,
    reference,
    removed: row.unmatchedReferences.length !== nextReferences.length || row.unmatchedDetails.length !== nextDetails.length,
  };
}

function amountCollectedFromRow(row: SpreadsheetRow) {
  return row.encaisse > 0 ? row.encaisse : row.montant;
}

export async function createManualOrder(input: ManualOrderInput, actor?: ActionActor) {
  const db = getDb();
  const value = manualOrderInputSchema.parse(input);
  const existing = await db.select({ id: processedOrders.id }).from(processedOrders).where(eq(processedOrders.tracking, value.tracking)).limit(1);

  if (existing[0]) {
    throw new Error('A processed order with this tracking already exists');
  }

  const totalProductCost = value.products.reduce((sum, product) => sum + product.cost * product.quantity, 0);
  const totalFees =
    value.feeBreakdown.livraison +
    value.feeBreakdown.poids +
    value.feeBreakdown.extra +
    value.feeBreakdown.sms +
    value.feeBreakdown.stockage +
    value.feeBreakdown.commission;
  const netRevenue = value.amountCollected - totalFees;
  const profit = netRevenue - totalProductCost;
  const orderId = `MANUAL-${crypto.randomUUID().slice(0, 8)}`;

  const inserted = await mutateEntityWithHistory<{ id: number; tracking: string }>(db, {
    entityType: 'statsManualOrders',
    operation: 'create',
    actor,
    resolveEntityId: (result) => result.id,
    execute: async (tx) => {
      const [order] = await tx
        .insert(processedOrders)
        .values({
          orderId,
          tracking: value.tracking,
          customerName: value.customerName,
          wilaya: value.wilaya,
          commune: value.commune,
          deliveryType: value.deliveryType,
          amountCollected: value.amountCollected.toFixed(2),
          totalFees: totalFees.toFixed(2),
          netRevenue: netRevenue.toFixed(2),
          productCost: totalProductCost.toFixed(2),
          profit: profit.toFixed(2),
          feeLivraison: value.feeBreakdown.livraison.toFixed(2),
          feePoids: value.feeBreakdown.poids.toFixed(2),
          feeExtra: value.feeBreakdown.extra.toFixed(2),
          feeSms: value.feeBreakdown.sms.toFixed(2),
          feeStockage: value.feeBreakdown.stockage.toFixed(2),
          feeCommission: value.feeBreakdown.commission.toFixed(2),
          deliveredAt: value.deliveredAt ? new Date(value.deliveredAt) : null,
          encaissedAt: value.encaissedAt ? new Date(value.encaissedAt) : value.deliveredAt ? new Date(value.deliveredAt) : null,
          orderCreatedAt: value.createdAt ? new Date(value.createdAt) : new Date(),
          importBatchId: 'MANUAL',
        })
        .returning({ id: processedOrders.id, tracking: processedOrders.tracking });

      const childRows = value.products.flatMap((product) =>
        Array.from({ length: product.quantity }).map(() => ({
          processedOrderId: order.id,
          productId: product.productId,
          title: product.title,
          price: product.price.toFixed(2),
          cost: product.cost.toFixed(2),
          sku: product.sku ?? null,
          categoryId: product.categoryId ?? null,
          categoryName: product.categoryName ?? null,
          brandId: product.brandId ?? null,
          brandName: product.brandName ?? null,
        })),
      );

      if (childRows.length > 0) {
        await tx.insert(processedOrderProducts).values(childRows);
      }

      return order;
    },
  });

  return inserted;
}

export async function listManualOrders(input?: z.input<typeof manualOrderListQuerySchema>) {
  const query = manualOrderListQuerySchema.parse(input ?? {});
  const db = getDb();
  const [{ value: totalItems }] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(processedOrders)
    .where(eq(processedOrders.importBatchId, 'MANUAL'));

  const totalPages = Math.max(1, Math.ceil(totalItems / query.limit));
  const page = Math.min(query.page, totalPages);
  const rows = await db
    .select({
      id: processedOrders.id,
      tracking: processedOrders.tracking,
      customerName: processedOrders.customerName,
      wilaya: processedOrders.wilaya,
      amountCollected: processedOrders.amountCollected,
      netRevenue: processedOrders.netRevenue,
      profit: processedOrders.profit,
      createdAt: processedOrders.orderCreatedAt,
    })
    .from(processedOrders)
    .where(eq(processedOrders.importBatchId, 'MANUAL'))
    .orderBy(desc(processedOrders.orderCreatedAt))
    .limit(query.limit)
    .offset((page - 1) * query.limit);

  const orderIds = rows.map((row) => row.id);
  const productRows = orderIds.length === 0
    ? []
    : await db
      .select({
        processedOrderId: processedOrderProducts.processedOrderId,
        title: processedOrderProducts.title,
      })
      .from(processedOrderProducts)
      .where(inArray(processedOrderProducts.processedOrderId, orderIds));

  const productsByOrder = new Map<number, Map<string, number>>();
  for (const row of productRows) {
    const bucket = productsByOrder.get(row.processedOrderId) ?? new Map<string, number>();
    bucket.set(row.title ?? 'Product', (bucket.get(row.title ?? 'Product') ?? 0) + 1);
    productsByOrder.set(row.processedOrderId, bucket);
  }

  return {
    data: rows.map((row) => ({
      id: String(row.id),
      tracking: row.tracking,
      customerName: row.customerName,
      wilaya: row.wilaya,
      amountCollected: numberOrZero(row.amountCollected),
      netRevenue: numberOrZero(row.netRevenue),
      profit: numberOrZero(row.profit),
      createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
      products: Array.from(productsByOrder.get(row.id)?.entries() ?? []).map(([title, quantity]) => ({ title, quantity })),
    })),
    pagination: {
      page,
      limit: query.limit,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}

export async function deleteManualOrder(id: string, actor?: ActionActor) {
  const db = getDb();
  const numericId = Number.parseInt(id, 10);
  if (!Number.isFinite(numericId)) {
    return null;
  }

  const current = await db
    .select({ id: processedOrders.id })
    .from(processedOrders)
    .where(and(eq(processedOrders.id, numericId), eq(processedOrders.importBatchId, 'MANUAL')))
    .limit(1);

  if (!current[0]) {
    return null;
  }

  const deleted = await mutateEntityWithHistory(db, {
    entityType: 'statsManualOrders',
    entityId: numericId,
    operation: 'delete',
    actor,
    execute: (tx) =>
      tx
        .delete(processedOrders)
        .where(and(eq(processedOrders.id, numericId), eq(processedOrders.importBatchId, 'MANUAL')))
        .returning({ id: processedOrders.id }),
  });

  return deleted[0] ?? null;
}

export async function listAdCosts(filters: StatsFilters | Required<StatsFilters>) {
  const db = getDb();
  const adWhere = buildAdCostWhere(filters);
  const rows = await db.select().from(adCosts).where(adWhere).orderBy(desc(adCosts.date)).limit(500);
  return rows.map((row) => ({
    id: String(row.id),
    date: row.date,
    platform: row.platform,
    campaignName: row.campaignName,
    campaignId: row.campaignId,
    spend: numberOrZero(row.spend),
    impressions: row.impressions ?? 0,
    clicks: row.clicks ?? 0,
    conversions: row.conversions ?? 0,
    reach: row.reach ?? 0,
    notes: row.notes,
    importBatchId: row.importBatchId,
  }));
}

export async function listAdSpendImportBatches() {
  const db = getDb();
  await ensureLegacyAdSpendImportBatch();
  const rows = await db
    .select({
      batchId: adSpendImportBatches.batchId,
      fileName: adSpendImportBatches.fileName,
      rate: adSpendImportBatches.rate,
      totalRows: adSpendImportBatches.totalRows,
      importedRows: adSpendImportBatches.importedRows,
      updatedRows: adSpendImportBatches.updatedRows,
      importedAt: adSpendImportBatches.importedAt,
      currentRows: sql<number>`coalesce(count(${adCosts.id})::int, 0)`,
      currentSpend: sql<number>`coalesce(sum(${adCosts.spend})::double precision, 0)`,
      dateRangeStart: sql<string | null>`min(${adCosts.date})`,
      dateRangeEnd: sql<string | null>`max(${adCosts.date})`,
    })
    .from(adSpendImportBatches)
    .leftJoin(adCosts, eq(adCosts.importBatchId, adSpendImportBatches.batchId))
    .groupBy(
      adSpendImportBatches.id,
      adSpendImportBatches.batchId,
      adSpendImportBatches.fileName,
      adSpendImportBatches.rate,
      adSpendImportBatches.totalRows,
      adSpendImportBatches.importedRows,
      adSpendImportBatches.updatedRows,
      adSpendImportBatches.importedAt,
    )
    .orderBy(desc(adSpendImportBatches.importedAt), desc(adSpendImportBatches.id))
    .limit(100);

  return rows.map((row) => ({
    batchId: row.batchId,
    fileName: row.fileName,
    rate: numberOrZero(row.rate),
    totalRows: row.totalRows,
    importedRows: row.importedRows,
    updatedRows: row.updatedRows,
    importedAt: row.importedAt.toISOString(),
    currentRows: row.currentRows,
    currentSpend: numberOrZero(row.currentSpend),
    dateRangeStart: row.dateRangeStart,
    dateRangeEnd: row.dateRangeEnd,
  }));
}

async function ensureLegacyAdSpendImportBatch() {
  const db = getDb();
  const legacyImportWhere = and(sql`${adCosts.importBatchId} is null`, sql`${adCosts.notes} like 'Imported at rate %'`);
  const [{ rows = 0 } = { rows: 0 }] = await db
    .select({ rows: count() })
    .from(adCosts)
    .where(legacyImportWhere);

  if (rows === 0) {
    return;
  }

  const now = new Date();
  await db
    .insert(adSpendImportBatches)
    .values({
      batchId: LEGACY_AD_SPEND_IMPORT_BATCH_ID,
      fileName: 'Legacy ad spend rows',
      rate: '1.0000',
      totalRows: rows,
      importedRows: rows,
      updatedRows: 0,
      importedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: adSpendImportBatches.batchId,
      set: {
        totalRows: rows,
        importedRows: rows,
        updatedAt: now,
      },
    });

  await db
    .update(adCosts)
    .set({
      importBatchId: LEGACY_AD_SPEND_IMPORT_BATCH_ID,
      updatedAt: now,
    })
    .where(legacyImportWhere);
}

export async function upsertAdCostEntry(input: AdCostEntryInput, actor?: ActionActor) {
  const db = getDb();
  const value = adCostEntrySchema.parse(input);
  const campaignName = value.campaignName?.trim() || null;
  const now = new Date();
  const existing = await db
    .select({ id: adCosts.id })
    .from(adCosts)
    .where(
      and(
        eq(adCosts.date, value.date),
        eq(adCosts.platform, value.platform),
        campaignName ? eq(adCosts.campaignName, campaignName) : sql`${adCosts.campaignName} is null`,
      ),
    )
    .limit(1);

  if (existing[0]) {
    const [updated] = await mutateEntityWithHistory(db, {
      entityType: 'statsAdCosts',
      entityId: existing[0].id,
      operation: 'update',
      actor,
      execute: (tx) =>
        tx
          .update(adCosts)
          .set({
            campaignId: value.campaignId ?? null,
            spend: value.spend.toFixed(2),
            impressions: value.impressions,
            clicks: value.clicks,
            conversions: value.conversions,
            reach: value.reach,
            notes: value.notes ?? null,
            importBatchId: value.importBatchId ?? null,
            updatedAt: now,
          })
          .where(eq(adCosts.id, existing[0].id))
          .returning({ id: adCosts.id }),
    });

    return {
      ...updated,
      created: false,
    };
  }

  const [created] = await mutateEntityWithHistory<Array<{ id: number }>>(db, {
    entityType: 'statsAdCosts',
    operation: 'create',
    actor,
    resolveEntityId: (result) => result[0]?.id,
    execute: (tx) =>
      tx
        .insert(adCosts)
        .values({
          date: value.date,
          platform: value.platform,
          campaignName,
          campaignId: value.campaignId ?? null,
          spend: value.spend.toFixed(2),
          impressions: value.impressions,
          clicks: value.clicks,
          conversions: value.conversions,
          reach: value.reach,
          notes: value.notes ?? null,
          importBatchId: value.importBatchId ?? null,
          updatedAt: now,
        })
        .returning({ id: adCosts.id }),
  });

  return {
    ...created,
    created: true,
  };
}

export async function deleteAdCostEntry(id: string, actor?: ActionActor) {
  const db = getDb();
  const numericId = Number.parseInt(id, 10);
  if (!Number.isFinite(numericId)) {
    return null;
  }

  const existing = await db.select({ id: adCosts.id }).from(adCosts).where(eq(adCosts.id, numericId)).limit(1);
  if (!existing[0]) {
    return null;
  }

  const deleted = await mutateEntityWithHistory(db, {
    entityType: 'statsAdCosts',
    entityId: numericId,
    operation: 'delete',
    actor,
    execute: (tx) => tx.delete(adCosts).where(eq(adCosts.id, numericId)).returning({ id: adCosts.id }),
  });
  return deleted[0] ?? null;
}

export async function deleteAdSpendImportBatch(batchId: string) {
  const db = getDb();
  const batch = batchId.trim();
  if (!batch) {
    return null;
  }

  const existing = await db
    .select({
      batchId: adSpendImportBatches.batchId,
      fileName: adSpendImportBatches.fileName,
    })
    .from(adSpendImportBatches)
    .where(eq(adSpendImportBatches.batchId, batch))
    .limit(1);

  if (!existing[0]) {
    return null;
  }

  const rows = await db.transaction(async (tx) => {
    const deletedRows = await tx.delete(adCosts).where(eq(adCosts.importBatchId, batch)).returning({ id: adCosts.id });
    await tx.delete(adSpendImportBatches).where(eq(adSpendImportBatches.batchId, batch));
    return deletedRows.length;
  });

  return {
    ...existing[0],
    deletedRows: rows,
  };
}

export function buildAdCostEntriesFromSpreadsheetRow(row: Record<string, unknown>, rate: number) {
  const startDate = parseDate(valueFor(row, ['Reporting starts', 'Start Date', 'Date', 'date']));
  const endDate = parseDate(valueFor(row, ['Reporting ends', 'End Date', 'Date', 'date'])) ?? startDate;
  const spendRaw = valueFor(row, ['Amount spent (EUR)', 'Amount spent', 'spend']);

  if (!startDate || !endDate || spendRaw == null) {
    return [];
  }

  const spend = numberOrZero(spendRaw) * rate;
  const days = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1);
  const dailySpend = spend / days;

  const entries: AdCostEntryInput[] = [];
  for (let index = 0; index < days; index += 1) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);
    entries.push({
      date: toDateInput(date),
      platform: normalizeText(valueFor(row, ['platform', 'Platform'])) || 'facebook',
      campaignName: normalizeText(valueFor(row, ['Campaign name', 'Campaign Name', 'Campaign'])) || null,
      campaignId: normalizeText(valueFor(row, ['Campaign ID', 'campaign_id'])) || null,
      spend: round(dailySpend),
      impressions: Math.round(numberOrZero(valueFor(row, ['Impressions', 'impressions'])) / days) || undefined,
      clicks: Math.round(numberOrZero(valueFor(row, ['Clicks (all)', 'Link clicks', 'Clicks', 'clicks'])) / days) || undefined,
      conversions: Math.round(numberOrZero(valueFor(row, ['Results', 'results', 'Conversions', 'Website checkouts initiated', 'Website purchases'])) / days) || undefined,
      reach: Math.round(numberOrZero(valueFor(row, ['Reach', 'reach'])) / days) || undefined,
      notes: `Imported at rate ${rate}`,
    });
  }

  return entries;
}

export async function importAdCostsSpreadsheet(buffer: Buffer, rate: number, fileName: string, actor?: ActionActor) {
  const db = getDb();
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = sheet ? XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet) : [];
  const batchId = crypto.randomUUID();
  const now = new Date();

  await db.insert(adSpendImportBatches).values({
    batchId,
    fileName,
    rate: rate.toFixed(4),
    totalRows: rows.length,
    uploadedByEmail: actor?.email ?? null,
    uploadedByName: actor?.name ?? null,
    updatedAt: now,
  });

  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const entries = buildAdCostEntriesFromSpreadsheetRow(row, rate);
    if (entries.length === 0) {
      skipped += 1;
      continue;
    }

    for (const costEntry of entries) {
      const entry = await upsertAdCostEntry({ ...costEntry, importBatchId: batchId }, actor);
      if (entry.created) {
        imported += 1;
      } else {
        updated += 1;
      }
    }
  }

  await db
    .update(adSpendImportBatches)
    .set({
      importedRows: imported,
      updatedRows: updated,
      updatedAt: new Date(),
    })
    .where(eq(adSpendImportBatches.batchId, batchId));

  return { batchId, fileName, imported, updated, skipped, total: rows.length };
}

export function formatCompactNumber(value: number) {
  return numberFormatter.format(round(value));
}
