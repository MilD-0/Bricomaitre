import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AnalyticsPayload } from '../../lib/analytics';
import { StatsWorkspace } from './analytics-workspace';

const { localeState, pushMock, replaceMock, searchParamsState } = vi.hoisted(() => ({
  localeState: { current: 'en' },
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  searchParamsState: { current: 'range=30d&grain=auto' },
}));

vi.mock('next-intl', () => ({
  useLocale: () => localeState.current,
  useTranslations: () => (key: string) =>
    ({
      'nav.statsOverview': 'Overview',
      'nav.statsMoney': 'Money',
      'nav.statsAcquisition': 'Acquisition',
      'nav.statsFulfillment': 'Fulfillment',
      'nav.statsStorefront': 'Storefront',
      'nav.statsSearch': 'Search visibility',
      'nav.statsCatalog': 'Catalog',
      'nav.statsAssumptions': 'Costs & assumptions',
    })[key] ?? key,
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/en/stats',
  useSearchParams: () => new URLSearchParams(searchParamsState.current),
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
}));

function commandPayload(): AnalyticsPayload {
  return {
    view: 'command',
    filters: {
      view: 'command',
      range: '30d',
      startDate: '2026-07-21',
      endDate: '2026-08-19',
      grain: 'auto',
      resolvedGrain: 'day',
      comparisonStartDate: '2026-06-21',
      comparisonEndDate: '2026-07-20',
    },
    generatedAt: new Date().toISOString(),
    data: {
      kind: 'command',
      metrics: [
        { key: 'trueProfit', value: 100_000, previous: 90_000, changePct: 11.11, unit: 'dzd' },
        { key: 'profitX', value: 1.4, previous: 1.2, changePct: 16.67, unit: 'ratio' },
      ],
      economics: {
        summary: {},
        realized: { realizedProfitDzd: 84_000 },
        coverage: { projectedCoveragePct: 98.5 },
        automaticPaid: {
          summary: {
            paidOrders: 50,
            codDzd: 500_000,
            feesDzd: 20_000,
            netRecoveredDzd: 480_000,
            productCostDzd: 250_000,
            profitDzd: 230_000,
            completeOrders: 49,
            profitCoveragePct: 98,
            providerAmountCoveragePct: 96,
            legacyFallbackOrders: 2,
            submittedFallbackOrders: 0,
          },
          days: [],
        },
      },
      trajectory: [],
      fulfillment: {
        summary: {},
        cashPipeline: [
          {
            key: 'submitted',
            orders: 8,
            amountDzd: 80_000,
            providerAmountCoveragePct: null,
            medianAgeHours: null,
            oldestAgeHours: null,
            staleOrders: 0,
            confidencePct: 55,
          },
          {
            key: 'confirmed',
            orders: 6,
            amountDzd: 60_000,
            providerAmountCoveragePct: null,
            medianAgeHours: null,
            oldestAgeHours: null,
            staleOrders: 0,
            confidencePct: 82,
          },
          {
            key: 'inTransit',
            orders: 10,
            amountDzd: 100_000,
            providerAmountCoveragePct: 90,
            medianAgeHours: 20,
            oldestAgeHours: 50,
            staleOrders: 1,
          },
          {
            key: 'deliveredAwaitingCollection',
            orders: 4,
            amountDzd: 40_000,
            providerAmountCoveragePct: 100,
            medianAgeHours: 12,
            oldestAgeHours: 18,
            staleOrders: 0,
          },
          {
            key: 'collectedAwaitingPayout',
            orders: 3,
            amountDzd: 30_000,
            providerAmountCoveragePct: 100,
            medianAgeHours: 24,
            oldestAgeHours: 36,
            staleOrders: 0,
          },
          {
            key: 'paymentReady',
            orders: 2,
            amountDzd: 20_000,
            providerAmountCoveragePct: 100,
            medianAgeHours: 6,
            oldestAgeHours: 8,
            staleOrders: 0,
          },
          {
            key: 'paid',
            orders: 50,
            amountDzd: 500_000,
            providerAmountCoveragePct: 96,
            medianAgeHours: 120,
            oldestAgeHours: 200,
            staleOrders: 50,
          },
        ],
        funnel: [
          { key: 'submitted', value: 100 },
          { key: 'confirmed', value: 82 },
          { key: 'posted', value: 70 },
          { key: 'paid', value: 50 },
        ],
      },
      storefront: {
        sessions: 1000,
        engagedSessions: 600,
        purchases: 30,
        conversionRate: 3,
        trend: [],
      },
      returns: {
        planningRatePct: 10,
        mature: { ratePct: 26, paid: 74, returned: 26, terminal: 100, cutoffDate: '2026-07-29' },
        allTerminal: { ratePct: 25, paid: 75, returned: 25, terminal: 100 },
      },
      forecast: { days: [], nextSevenDayTrueProfitDzd: 70_000 },
      signals: [{ key: 'aboveBreakEven', severity: 'positive', value: 1.4, unit: 'ratio' }],
    } as unknown as AnalyticsPayload['data'],
    sources: [
      {
        key: 'orders',
        state: 'live',
        updatedAt: null,
        throughDate: '2026-08-19',
        records: 100,
        coveragePct: 100,
      },
      {
        key: 'ecotrack',
        state: 'live',
        updatedAt: null,
        throughDate: '2026-08-19',
        records: 70,
        coveragePct: 100,
      },
    ],
    warnings: [],
    diagnostics: { queryDurationMs: 42, responseSizeBytes: 1024 },
  } as unknown as AnalyticsPayload;
}

function searchPayload(): AnalyticsPayload {
  return {
    view: 'search',
    filters: {
      view: 'search',
      range: '30d',
      startDate: '2026-07-19',
      endDate: '2026-08-17',
      grain: 'auto',
      resolvedGrain: 'day',
      comparisonStartDate: '2026-06-19',
      comparisonEndDate: '2026-07-18',
    },
    generatedAt: new Date().toISOString(),
    data: {
      kind: 'search',
      metrics: [
        { key: 'searchClicks', value: 250, previous: 200, changePct: 25, unit: 'number' },
        { key: 'searchImpressions', value: 5_000, previous: 4_000, changePct: 25, unit: 'number' },
        { key: 'searchCtr', value: 5, previous: 5, changePct: 0, unit: 'percent' },
        {
          key: 'averagePosition',
          value: 9,
          previous: 12,
          changePct: -25,
          unit: 'number',
          goodWhen: 'down',
        },
      ],
      trend: [{ bucket: '2026-08-17', clicks: 10, impressions: 200, ctrPct: 5, position: 9 }],
      opportunities: [
        {
          query: 'perceuse sans fil',
          clicks: 1,
          impressions: 100,
          ctrPct: 1,
          position: 8,
          pages: 1,
          branded: false,
          benchmarkCtrPct: 5,
          potentialClicks: 4,
          opportunity: 'strikingDistance',
          topPages: [
            {
              page: 'https://bricomaitre.com/fr/products/perceuse',
              path: '/products/perceuse',
              clicks: 1,
              impressions: 100,
            },
          ],
        },
      ],
      pages: [
        {
          page: 'https://bricomaitre.com/fr/products/perceuse',
          path: '/products/perceuse',
          label: '/products/perceuse · FR',
          clicks: 20,
          impressions: 400,
          ctrPct: 5,
          position: 7,
          queries: 12,
          topQueries: [{ query: 'perceuse sans fil', clicks: 10, impressions: 200 }],
        },
      ],
      devices: [{ device: 'MOBILE', clicks: 200, impressions: 4_000, ctrPct: 5, position: 9 }],
      countries: [{ country: 'dza', clicks: 240, impressions: 4_800, ctrPct: 5, position: 9 }],
      appearances: [
        { appearance: 'PRODUCT_SNIPPETS', clicks: 30, impressions: 600, ctrPct: 5, position: 6 },
      ],
      discovery: {
        brandedClicksPct: 10,
        nonBrandedClicksPct: 90,
        queryClickCoveragePct: 94,
        queryImpressionCoveragePct: 92,
      },
      indexHealth: {
        inspections: [],
        issues: [],
        sitemaps: [
          {
            path: 'https://bricomaitre.com/sitemap.xml',
            pending: false,
            warnings: 0,
            errors: 0,
            submittedUrls: 3521,
            lastDownloadedAt: '2026-08-19T00:00:00.000Z',
            syncedAt: '2026-08-20T00:00:00.000Z',
          },
        ],
        lastSync: {
          status: 'succeeded',
          since: '2026-08-10',
          until: '2026-08-17',
          startedAt: '2026-08-20T00:00:00.000Z',
          completedAt: '2026-08-20T00:00:03.000Z',
          detailRows: 500,
        },
      },
    },
    sources: [
      {
        key: 'searchConsole',
        state: 'current',
        updatedAt: '2026-08-20T00:00:00.000Z',
        throughDate: '2026-08-17',
        records: 30,
        coveragePct: 94,
      },
    ],
    warnings: [{ key: 'searchDetailCoverage', source: 'searchConsole', value: 94 }],
    diagnostics: { queryDurationMs: 18, responseSizeBytes: 4096 },
  } as unknown as AnalyticsPayload;
}

function renderWorkspace(payload = commandPayload()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <StatsWorkspace initialData={payload} />
    </QueryClientProvider>,
  );
}

describe('StatsWorkspace', () => {
  beforeEach(() => {
    localeState.current = 'en';
    searchParamsState.current = 'range=30d&grain=auto';
    vi.clearAllMocks();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => JSON.stringify({ data: commandPayload() }),
      }),
    );
  });

  afterEach(() => cleanup());

  it('presents Search Console as a focused opportunity workspace', () => {
    renderWorkspace(searchPayload());

    expect(screen.getByText('Google Search')).toBeInTheDocument();
    expect(screen.getAllByText('perceuse sans fil').length).toBeGreaterThan(0);
    expect(screen.getByText('3,521 URLs')).toBeInTheDocument();
    expect(screen.getAllByText('/products/perceuse · FR')).toHaveLength(2);
    expect(screen.getByText('No URLs inspected')).toBeInTheDocument();
    expect(screen.queryByText('Non-brand discovery')).not.toBeInTheDocument();
    expect(screen.queryByText('Query-detail coverage')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Query and page detail is privacy-limited by Google'),
    ).not.toBeInTheDocument();
  });
});
