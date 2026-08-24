import type { getProfitTrackerReport } from './profit-tracker';
import { getProfitTrackerReport as loadEconomics } from './profit-tracker';
import {
  getStatsDashboard,
  getStatsDashboardSection,
  refreshStatsDashboard,
  type StatsDashboardData,
  type StatsFilters,
} from './stats';

export type AnalyticsSection =
  | 'overview'
  | 'website'
  | 'landingPages'
  | 'aiAssistants'
  | 'customers'
  | 'products'
  | 'geography'
  | 'time'
  | 'metaAds';

type EconomicsReport = Awaited<ReturnType<typeof getProfitTrackerReport>>;

export type AnalyticsSectionPayload = StatsDashboardData & {
  economics?: EconomicsReport;
  freshness: EconomicsReport['freshness'] | StatsDashboardData['snapshot'] | null;
  sourceCoverage: EconomicsReport['coverage'] | null;
  partialDataWarnings: string[];
  diagnostics: {
    queryDurationMs: number;
    responseSizeBytes: number;
  };
};

function compactDashboard(data: StatsDashboardData, section: AnalyticsSection) {
  const keepsTime = section === 'overview' || section === 'time';
  const keepsWebsite = section === 'overview' || section === 'website' || section === 'metaAds';
  const keepsMeta = section === 'metaAds';
  const keepsProducts = section === 'products';
  const keepsGeography = section === 'geography';

  return {
    ...data,
    trends: keepsTime
      ? { ...data.trends, imports: [] }
      : { daily: [], weekly: [], monthly: [], imports: [] },
    metaAds: keepsMeta
      ? data.metaAds
      : {
          ...data.metaAds,
          events: [],
          recentPayloads: [],
          paidAttribution: { ...data.metaAds.paidAttribution, topCampaigns: [] },
          commerce: { ...data.metaAds.commerce, rows: [] },
        },
    wilayas: keepsGeography ? data.wilayas : [],
    wilayaDetails: keepsGeography ? data.wilayaDetails : [],
    deliveries: keepsGeography ? data.deliveries : [],
    topProducts: keepsProducts ? data.topProducts : [],
    allProducts: keepsProducts ? data.allProducts : [],
    topCategories: keepsProducts ? data.topCategories : [],
    topBrands: keepsProducts ? data.topBrands : [],
    profitability: section === 'overview' ? data.profitability : [],
    importHistory: [],
    latestUnmatchedReferences: [],
    latestUnmatchedDetails: [],
    website: keepsWebsite
      ? data.website
      : {
          ...data.website,
          topSearches: [],
          funnel: [],
          topProducts: [],
          pageTypes: [],
          locales: [],
          devices: [],
          vitals: [],
          acquisitionSources: [],
          trend: [],
        },
    landingPages:
      section === 'landingPages'
        ? data.landingPages
        : { ...data.landingPages, pages: [], blocks: [] },
    customers: section === 'customers' ? data.customers : { ...data.customers, customers: [] },
    aiAssistants:
      section === 'aiAssistants'
        ? data.aiAssistants
        : {
            admin: { ...data.aiAssistants.admin, topTasks: [], models: [], trend: [] },
            storefront: {
              ...data.aiAssistants.storefront,
              topTasks: [],
              models: [],
              trend: [],
              topIntents: [],
            },
          },
  } satisfies StatsDashboardData;
}

function economicsRange(filters: StatsFilters) {
  return {
    range: filters.range,
    startDate: filters.startDate,
    endDate: filters.endDate,
  } as const;
}

export async function getAnalyticsSectionData(
  section: AnalyticsSection,
  filters: StatsFilters,
  refresh = false,
): Promise<AnalyticsSectionPayload> {
  const startedAt = performance.now();
  const needsEconomics = section === 'overview' || section === 'time' || section === 'metaAds';
  const [dashboard, economics] = await Promise.all([
    needsEconomics
      ? getStatsDashboardSection(filters, section)
      : refresh
        ? refreshStatsDashboard(filters, `section-${section}-refresh`)
        : getStatsDashboard(filters),
    needsEconomics ? loadEconomics(economicsRange(filters)) : Promise.resolve(undefined),
  ]);
  const compact = compactDashboard(dashboard, section);
  const canonical =
    section === 'overview' && economics
      ? {
          ...compact,
          summary: {
            ...compact.summary,
            totalAmountCollected: economics.realized.summary.amountCollectedDzd,
            totalFees: economics.realized.summary.feesDzd,
            totalNetRevenue: economics.realized.summary.netRevenueDzd,
            totalGrossProfit: economics.realized.summary.realizedProfitDzd,
            netProfitAfterAds: economics.realized.summary.realizedProfitAfterAdsDzd,
          },
          adCosts: {
            ...compact.adCosts,
            totalSpend: economics.summary.rawAdCostDzd,
          },
        }
      : compact;
  const base = {
    ...canonical,
    ...(economics ? { economics } : {}),
    freshness: economics?.freshness ?? canonical.snapshot ?? null,
    sourceCoverage: economics?.coverage ?? null,
    partialDataWarnings: economics?.warnings ?? [],
    diagnostics: {
      queryDurationMs: Math.round(performance.now() - startedAt),
      responseSizeBytes: 0,
    },
  };
  const responseSizeBytes = Buffer.byteLength(JSON.stringify(base));
  return {
    ...base,
    diagnostics: { ...base.diagnostics, responseSizeBytes },
  };
}

export async function getCostsAndAssumptions(filters: StatsFilters) {
  const startedAt = performance.now();
  const economics = await loadEconomics(economicsRange(filters));
  const base = {
    economics,
    filters: economics.filters,
    freshness: economics.freshness,
    coverage: economics.coverage,
    warnings: economics.warnings,
    diagnostics: {
      queryDurationMs: Math.round(performance.now() - startedAt),
      responseSizeBytes: 0,
    },
  };
  return {
    ...base,
    diagnostics: {
      ...base.diagnostics,
      responseSizeBytes: Buffer.byteLength(JSON.stringify(base)),
    },
  };
}
