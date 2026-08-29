import { emptyMetaCommerceReport } from './meta-commerce-analytics';
import { emptyExperienceStats } from './stats-experience';
import type { StatsDashboardData, StatsFilters } from './stats-contract';

export function emptyDashboard(filters: Required<StatsFilters>): StatsDashboardData {
  const experience = emptyExperienceStats();
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
      trackingAvailable: false,
      paidAttribution: experience.metaPaidAttribution,
      commerce: emptyMetaCommerceReport(),
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
      topSearches: [],
      funnel: [],
      topProducts: [],
      ...experience.website,
    },
    landingPages: experience.landingPages,
    aiAssistants: experience.aiAssistants,
    customers: experience.customers,
  };
}

export async function optionalAnalyticsDiagnostic<T>(promise: Promise<T>) {
  try {
    return { available: true as const, data: await promise };
  } catch {
    return { available: false as const, data: null };
  }
}

export function normalizeStatsDashboardData(
  payload: unknown,
  filters: Required<StatsFilters>,
): StatsDashboardData {
  const fallback = emptyDashboard(filters);
  const data =
    payload && typeof payload === 'object' ? (payload as Partial<StatsDashboardData>) : {};
  const website = data.website ?? fallback.website;
  const metaAds = data.metaAds ?? fallback.metaAds;
  const landingPages = data.landingPages ?? fallback.landingPages;
  const aiAssistants = data.aiAssistants ?? fallback.aiAssistants;
  const customers = data.customers ?? fallback.customers;

  return {
    ...fallback,
    ...data,
    filters,
    summary: { ...fallback.summary, ...(data.summary ?? {}) },
    trends: { ...fallback.trends, ...(data.trends ?? {}) },
    feeBreakdown: { ...fallback.feeBreakdown, ...(data.feeBreakdown ?? {}) },
    adCosts: { ...fallback.adCosts, ...(data.adCosts ?? {}) },
    metaAds: {
      ...fallback.metaAds,
      ...metaAds,
      paidAttribution: {
        ...fallback.metaAds.paidAttribution,
        ...(metaAds.paidAttribution ?? {}),
      },
      commerce: {
        ...fallback.metaAds.commerce,
        ...(metaAds.commerce ?? {}),
        summary: {
          ...fallback.metaAds.commerce.summary,
          ...(metaAds.commerce?.summary ?? {}),
        },
        rows: metaAds.commerce?.rows ?? fallback.metaAds.commerce.rows,
        sync: metaAds.commerce?.sync ?? fallback.metaAds.commerce.sync,
      },
    },
    website: { ...fallback.website, ...website },
    landingPages: {
      ...fallback.landingPages,
      ...landingPages,
      summary: {
        ...fallback.landingPages.summary,
        ...(landingPages.summary ?? {}),
      },
    },
    aiAssistants: {
      admin: {
        ...fallback.aiAssistants.admin,
        ...(aiAssistants.admin ?? {}),
      },
      storefront: {
        ...fallback.aiAssistants.storefront,
        ...(aiAssistants.storefront ?? {}),
      },
    },
    customers: {
      ...fallback.customers,
      ...customers,
      summary: {
        ...fallback.customers.summary,
        ...(customers.summary ?? {}),
      },
    },
  };
}
