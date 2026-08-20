import { beforeEach, describe, expect, it, vi } from 'vitest';

const { dashboardMock, economicsMock, refreshMock, sectionDashboardMock } = vi.hoisted(() => ({
  dashboardMock: vi.fn(),
  economicsMock: vi.fn(),
  refreshMock: vi.fn(),
  sectionDashboardMock: vi.fn(),
}));

vi.mock('./profit-tracker', () => ({ getProfitTrackerReport: economicsMock }));
vi.mock('./stats', () => ({
  getStatsDashboard: dashboardMock,
  getStatsDashboardSection: sectionDashboardMock,
  refreshStatsDashboard: refreshMock,
}));

import { getAnalyticsSectionData } from './stats-sections';

const dashboard = {
  filters: { range: '30d', startDate: '2026-07-21', endDate: '2026-08-19' },
  summary: { totalOrders: 4 },
  trends: { daily: [], weekly: [], monthly: [], imports: [] },
  metaAds: {
    events: [],
    recentPayloads: [],
    paidAttribution: { topCampaigns: [] },
    commerce: { rows: [] },
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
  landingPages: { pages: [], blocks: [] },
  customers: { customers: [] },
  aiAssistants: {
    admin: { topTasks: [], models: [], trend: [] },
    storefront: { topTasks: [], models: [], trend: [], topIntents: [] },
  },
  adCosts: { totalSpend: 0 },
};

const economics = {
  filters: dashboard.filters,
  summary: { rawAdCostDzd: 1_000 },
  realized: {
    summary: {
      amountCollectedDzd: 20_000,
      feesDzd: 2_000,
      netRevenueDzd: 18_000,
      realizedProfitDzd: 8_000,
      realizedProfitAfterAdsDzd: 7_000,
    },
  },
  freshness: { metaSyncedAt: null },
  coverage: { projectedCoveragePct: 100 },
  warnings: [],
};

describe('getAnalyticsSectionData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dashboardMock.mockResolvedValue(dashboard);
    refreshMock.mockResolvedValue(dashboard);
    sectionDashboardMock.mockResolvedValue(dashboard);
    economicsMock.mockResolvedValue(economics);
  });

  it('uses a dedicated live query for consolidated sections, including custom ranges', async () => {
    const filters = {
      range: 'custom' as const,
      startDate: '2026-08-01',
      endDate: '2026-08-15',
    };
    const result = await getAnalyticsSectionData('time', filters);

    expect(sectionDashboardMock).toHaveBeenCalledWith(filters, 'time');
    expect(dashboardMock).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
    expect(result.diagnostics.responseSizeBytes).toBeGreaterThan(0);
  });

  it('replaces legacy overview financial totals with canonical realized and Meta economics', async () => {
    const result = await getAnalyticsSectionData('overview', { range: '30d' });

    expect(result.summary).toMatchObject({
      totalAmountCollected: 20_000,
      totalFees: 2_000,
      totalNetRevenue: 18_000,
      totalGrossProfit: 8_000,
      netProfitAfterAds: 7_000,
    });
    expect(result.adCosts.totalSpend).toBe(1_000);
    expect(result.sourceCoverage).toEqual(economics.coverage);
  });
});
