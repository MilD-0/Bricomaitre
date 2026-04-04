import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import * as XLSX from 'xlsx';
import { z } from 'zod';

import { getDb } from '../db/client';
import {
  adCosts,
  analyticsEvents,
  analyticsJourneys,
  brands,
  categories,
  importBatches,
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
  unmatchedCount: number;
  unmatchedReferences: string[];
  unmatchedDetails: UnmatchedImportRow[];
  dateRangeStart: string | null;
  dateRangeEnd: string | null;
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

type WebsiteMetricRow = {
  id: string;
  viewCount: number;
  addToCartCount: number;
  checkoutCount: number;
  websitePurchaseCount: number;
  popularityScore: number;
  websiteConversionRate: number;
};

async function getWebsiteAnalyticsData(db: ReturnType<typeof getDb>, analyticsWhere: ReturnType<typeof buildAnalyticsWhere>) {
  const emptyWebsiteAnalytics = {
    websiteSummaryRows: [] as WebsiteSummaryRow[],
    websiteLandingRows: [] as WebsiteLandingRow[],
    websiteSearchRows: [] as WebsiteSearchRow[],
    websiteTopProductRows: [] as WebsiteTopProductRow[],
    websiteMetricRows: [] as WebsiteMetricRow[],
  };

  const analyticsTableCheck = await db.execute(sql`
    select to_regclass('analytics_events') is not null as "analyticsEventsExists"
  `);
  const analyticsEventsExists = Boolean(analyticsTableCheck.rows[0]?.analyticsEventsExists);

  if (!analyticsEventsExists) {
    return emptyWebsiteAnalytics;
  }

  const productAnalyticsColumnsCheck = await db.execute(sql`
    select count(*)::int as "columnCount"
    from information_schema.columns
    where table_name = 'products'
      and column_name in ('view_count', 'add_to_cart_count', 'checkout_count', 'purchase_count', 'popularity_score', 'conversion_rate')
  `);
  const productAnalyticsColumnsExist = Number(productAnalyticsColumnsCheck.rows[0]?.columnCount ?? 0) === 6;

  const [
    websiteSummaryRows,
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
    productAnalyticsColumnsExist
      ? db
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
        .limit(8)
      : Promise.resolve([] as WebsiteTopProductRow[]),
    productAnalyticsColumnsExist
      ? db
        .select({
          id: products.id,
          viewCount: sql<number>`coalesce(${products.viewCount}, 0)::int`,
          addToCartCount: sql<number>`coalesce(${products.addToCartCount}, 0)::int`,
          checkoutCount: sql<number>`coalesce(${products.checkoutCount}, 0)::int`,
          websitePurchaseCount: sql<number>`coalesce(${products.purchaseCount}, 0)::int`,
          popularityScore: sql<number>`coalesce(${products.popularityScore}, 0)::double precision`,
          websiteConversionRate: sql<number>`coalesce(${products.conversionRate}, 0)::double precision`,
        })
        .from(products)
      : Promise.resolve([] as WebsiteMetricRow[]),
  ]);

  return {
    websiteSummaryRows: websiteSummaryRows as WebsiteSummaryRow[],
    websiteLandingRows: websiteLandingRows as WebsiteLandingRow[],
    websiteSearchRows: websiteSearchRows as WebsiteSearchRow[],
    websiteTopProductRows: websiteTopProductRows as WebsiteTopProductRow[],
    websiteMetricRows: websiteMetricRows as WebsiteMetricRow[],
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

export async function listImportHistory() {
  applyServerCache({ stale: 60, revalidate: 300, expire: 3600 }, CACHE_TAGS.statsHistory, CACHE_TAGS.stats);

  const db = getDb();
  const rows = await db.select().from(importBatches).orderBy(desc(importBatches.importedAt)).limit(8);

  return rows.map<ImportHistoryItem>((row) => ({
    id: row.id,
    batchId: row.batchId,
    fileName: row.fileName,
    importedAt: row.importedAt.toISOString(),
    totalRows: row.totalRows,
    matchedOrders: row.matchedOrders,
    unmatchedCount: row.unmatchedReferences.length,
    unmatchedReferences: row.unmatchedReferences,
    unmatchedDetails: row.unmatchedDetails,
    dateRangeStart: row.dateRangeStart,
    dateRangeEnd: row.dateRangeEnd,
  }));
}

export async function getStatsDashboard(input: StatsFilters) {
  applyServerCache({ stale: 60, revalidate: 300, expire: 1800 }, CACHE_TAGS.stats, CACHE_TAGS.statsHistory);

  const db = getDb();
  const filters = buildResolvedFilters(statsQuerySchema.parse(input));
  const where = buildStatsWhere(filters);
  const adWhere = buildAdCostWhere(filters);
  const analyticsWhere = buildAnalyticsWhere(filters);
  const websiteAnalyticsPromise = getWebsiteAnalyticsData(db, analyticsWhere);

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
      .where(inArray(orders.confirmed, [2, 3, 4, 5])),
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
    websiteLandingRows,
    websiteSearchRows,
    websiteTopProductRows,
    websiteMetricRows,
  } = await websiteAnalyticsPromise;

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

  if (!summaryRow || summaryRow.totalOrders === 0) {
    const data = emptyDashboard(filters);
    data.importHistory = importHistory;
    data.latestUnmatchedReferences = importHistory[0]?.unmatchedReferences.slice(0, 8) ?? [];
    data.latestUnmatchedDetails = (importHistory[0]?.unmatchedDetails ?? []).slice(0, 8).map((item) => ({
      ...item,
      batchId: importHistory[0]!.batchId,
    }));
    data.website = website;
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

export async function importStatsSpreadsheet(buffer: Buffer, fileName: string): Promise<StatsImportResult> {
  const db = getDb();
  const rows = parseSpreadsheet(buffer).filter((row) => row.reference || row.tracking);
  const batchId = crypto.randomUUID();

  const references = [...new Set(rows.map((row) => row.reference).filter(Boolean))];
  const trackings = [...new Set(rows.map((row) => row.tracking).filter(Boolean))];
  const numericReferences = references
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value));

  const orderConditions = [];

  if (numericReferences.length > 0) {
    orderConditions.push(inArray(orders.id, numericReferences));
  }

  if (references.length > 0) {
    orderConditions.push(inArray(orders.ecotrackReference, references));
  }

  if (trackings.length > 0) {
    orderConditions.push(inArray(orders.ecotrackTrackingNumber, trackings));
  }

  const [candidateOrders, existingRows] = await Promise.all([
    orderConditions.length > 0
      ? db.select().from(orders).where(or(...orderConditions))
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
  const orderByReference = new Map(
    candidateOrders
      .filter((order) => order.ecotrackReference)
      .map((order) => [order.ecotrackReference ?? '', order]),
  );
  const orderByTracking = new Map(
    candidateOrders
      .filter((order) => order.ecotrackTrackingNumber)
      .map((order) => [order.ecotrackTrackingNumber ?? '', order]),
  );
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

    const matchedOrder =
      orderById.get(row.reference)
      ?? orderByReference.get(row.reference)
      ?? orderByTracking.get(row.tracking);

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

  const stats = await getStatsDashboard({ range: '90d' });

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
  }));
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

export async function importAdCostsSpreadsheet(buffer: Buffer, rate: number, actor?: ActionActor) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = sheet ? XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet) : [];

  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const startDate = parseDate(row['Reporting starts'] ?? row['Start Date'] ?? row['Date'] ?? row.date);
    const endDate = parseDate(row['Reporting ends'] ?? row['End Date'] ?? row['Date'] ?? row.date) ?? startDate;
    const spendRaw = row['Amount spent (EUR)'] ?? row['Amount spent'] ?? row.spend;

    if (!startDate || !endDate || spendRaw == null) {
      skipped += 1;
      continue;
    }

    const spend = numberOrZero(spendRaw) * rate;
    const days = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1);
    const dailySpend = spend / days;

    for (let index = 0; index < days; index += 1) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + index);
      const entry = await upsertAdCostEntry({
        date: toDateInput(date),
        platform: normalizeText(row.platform ?? row.Platform) || 'facebook',
        campaignName: normalizeText(row['Campaign name'] ?? row['Campaign Name'] ?? row.Campaign) || null,
        campaignId: normalizeText(row['Campaign ID'] ?? row.campaign_id) || null,
        spend: round(dailySpend),
        impressions: Math.round(numberOrZero(row.Impressions ?? row.impressions) / days) || undefined,
        clicks: Math.round(numberOrZero(row['Clicks (all)'] ?? row.Clicks ?? row.clicks) / days) || undefined,
        conversions: Math.round(numberOrZero(row.Results ?? row.results ?? row.Conversions) / days) || undefined,
        reach: Math.round(numberOrZero(row.Reach ?? row.reach) / days) || undefined,
        notes: `Imported at rate ${rate}`,
      }, actor);

      if (entry.created) {
        imported += 1;
      } else {
        updated += 1;
      }
    }
  }

  return { imported, updated, skipped, total: rows.length };
}

export function formatCompactNumber(value: number) {
  return numberFormatter.format(round(value));
}
