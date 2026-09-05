import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AnalyticsPayload } from '../../lib/analytics';
import { AdminAiSurfaceProvider, useAdminAiSurfaceContext } from '../admin-ai-surface-context';
import { completedTrendBuckets, splitPartialSeries, StatsWorkspace } from './analytics-workspace';

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

describe('open-period chart series', () => {
  it('stops actuals at the last complete bucket and draws projected completion separately', () => {
    const rows = splitPartialSeries(
      [
        { label: 'Aug 7', profit: 100, profitProjected: null, isPartial: false },
        { label: 'Aug 14', profit: 40, profitProjected: 90, isPartial: true },
      ],
      ['profit'],
    );

    expect(rows[1]).toMatchObject({ profitActual: null, profitOpen: 90, profitDisplay: 90 });
    expect(rows[0]).toMatchObject({ profitActual: 100, profitOpen: 100 });
  });

  it('does not invent an open-period forecast when the metric has no projection', () => {
    const rows = splitPartialSeries(
      [
        { label: 'Aug 19', profit: 100, profitProjected: null, isPartial: true },
        {
          label: 'Aug 20',
          profit: null,
          profitProjected: 110,
          isPartial: false,
          isForecast: true,
        },
      ],
      ['profit'],
    );

    expect(rows[0]).toMatchObject({ profitActual: null, profitOpen: null });
    expect(rows[1]).toMatchObject({ profitActual: null, profitOpen: 110, profitDisplay: 110 });
  });
});

describe('completed trend buckets', () => {
  const rows = [
    { bucket: '2026-08-01', value: 100 },
    { bucket: '2026-09-01', value: 14 },
  ];

  it('removes a partial final month from charts without projection semantics', () => {
    expect(completedTrendBuckets(rows, 'month', '2026-09-04')).toEqual([rows[0]]);
  });

  it('retains complete months and daily buckets', () => {
    expect(completedTrendBuckets(rows, 'month', '2026-09-30')).toEqual(rows);
    expect(completedTrendBuckets(rows, 'day', '2026-09-04')).toEqual(rows);
    expect(completedTrendBuckets([rows[1]], 'month', '2026-09-04')).toEqual([rows[1]]);
  });

  it('removes a partial final week', () => {
    expect(
      completedTrendBuckets(
        [
          { bucket: '2026-08-24', value: 100 },
          { bucket: '2026-08-31', value: 30 },
        ],
        'week',
        '2026-09-04',
      ),
    ).toEqual([{ bucket: '2026-08-24', value: 100 }]);
  });
});

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

function assumptionsPayload(): AnalyticsPayload {
  return {
    view: 'assumptions',
    filters: {
      view: 'assumptions',
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
      kind: 'assumptions',
      metrics: [],
      settings: { fxRate: 280, defaultReturnRate: 10, restFrom: null },
      returns: {
        planningRatePct: 10,
        mature: { ratePct: 26, paid: 74, returned: 26, terminal: 100, cutoffDate: '2026-07-29' },
        allTerminal: { ratePct: 25, paid: 75, returned: 25, terminal: 100 },
      },
      costs: [
        {
          id: 7,
          name: 'Workspace rent',
          amountDzd: 60_000,
          period: 'monthly',
          startDate: '2026-01-01',
          endDate: null,
        },
      ],
      costSummary: {
        activeMonthlyBurnDzd: 60_000,
        periodOperatingCostDzd: 60_000,
        oneTimeCostsDzd: 0,
      },
      days: [
        {
          date: '2026-08-18',
          grossProfitDzd: 12_000,
          grossProfitSource: 'automatic',
          returnRatePct: 10,
          returnRateSource: 'default',
          confirmedOrders: 4,
          confirmedOrdersSource: 'automatic',
          note: null,
        },
        {
          date: '2026-08-17',
          grossProfitDzd: 15_000,
          grossProfitSource: 'manual',
          returnRatePct: 12,
          returnRateSource: 'manual',
          confirmedOrders: 5,
          confirmedOrdersSource: 'manual',
          note: 'Promotion correction',
        },
      ],
      automationDelta: {
        orders: 100,
        fees: {
          actualDzd: 100_000,
          automatedDzd: 98_000,
          differenceDzd: -2_000,
          differencePct: -2,
        },
        netRecovered: {
          actualDzd: 1_000_000,
          automatedDzd: 1_002_000,
          differenceDzd: 2_000,
          differencePct: 0.2,
        },
        profit: {
          actualDzd: 400_000,
          automatedDzd: 403_000,
          differenceDzd: 3_000,
          differencePct: 0.75,
          exactPct: 97,
          p95ErrorDzd: 0,
        },
      },
      formula: {
        adCost: 'metaSpendEur * fxRateUsed',
        adjustedProfit:
          'realizedEligibleProfitDzd + unresolvedProfitDzd * (1 - returnRatePct / 100)',
        netProfit: 'adjustedProfitDzd - adCostDzd',
        profitX: 'adjustedProfitDzd / adCostDzd',
        trueProfit: 'netProfitDzd - operatingCostDzd',
      },
    } as unknown as AnalyticsPayload['data'],
    sources: [
      {
        key: 'assumptions',
        state: 'manual',
        updatedAt: null,
        throughDate: null,
        records: 1,
        coveragePct: 100,
      },
    ],
    warnings: [],
    diagnostics: { queryDurationMs: 25, responseSizeBytes: 2048 },
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

function catalogPayload(): AnalyticsPayload {
  const base = commandPayload();
  return {
    ...base,
    view: 'catalog',
    filters: { ...base.filters, view: 'catalog' },
    data: {
      kind: 'catalog',
      metrics: [],
      products: [
        {
          id: 'p1',
          title: 'High confidence product',
          sku: 'P1',
          categoryName: 'Tools',
          brandName: 'Bricomaitre',
          postedOrders: 30,
          postedUnits: 32,
          paidOrders: 18,
          paidUnits: 18,
          returnedOrders: 6,
          activeOrders: 4,
          terminalPaidRatePct: 75,
          costCoveragePct: 96,
          projectedContributionDzd: 12_000,
          deliveryMedianHours: 48,
          paymentMedianHours: 120,
          deliverySamples: 24,
          metaAssociations: [],
          viewCount: 1_200,
          addToCartCount: 100,
          checkoutCount: 40,
          websitePurchaseCount: 30,
          popularityScore: 1,
          websiteConversionRate: 2.5,
          changes: { unitsPct: null },
        },
      ],
      basketPairs: [],
      geography: { wilayas: [], communes: [], metaRegions: [] },
      customers: {
        summary: { customers: 1, secondOrderConversionPct: 0 },
        rows: [
          {
            name: 'Customer A',
            city: 'Algiers',
            orders: 3,
            paidOrders: 1,
            totalValue: 30_000,
            paidValueDzd: 10_000,
            contributionLtvDzd: 3_000,
            paidContributionMarginPct: 30,
            fallbackMarginOrders: 1,
            firstOrderAt: '2026-08-01T00:00:00.000Z',
          },
        ],
      },
    } as unknown as AnalyticsPayload['data'],
  };
}

function renderWorkspace(payload = commandPayload()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <StatsWorkspace initialData={payload} />
    </QueryClientProvider>,
  );
}

function SurfaceContextProbe() {
  const context = useAdminAiSurfaceContext();
  return <output data-testid="surface-context">{JSON.stringify(context)}</output>;
}

function renderWorkspaceWithContext(payload = commandPayload()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AdminAiSurfaceProvider>
        <StatsWorkspace initialData={payload} />
        <SurfaceContextProbe />
      </AdminAiSurfaceProvider>
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

  it('reuses fresh server data without rewriting an already normalized URL', () => {
    renderWorkspace();

    expect(fetch).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('keeps the clean default route without triggering a duplicate server render', () => {
    searchParamsState.current = '';
    renderWorkspace();

    expect(fetch).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('renders a lean operational workspace with source health and operator signals', () => {
    const { container } = renderWorkspace();

    expect(container.querySelector('[data-admin-workspace="stats"]')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-workspace-frame]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-workspace-header]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-workspace-toolbar]')).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Overview' })).toHaveClass(
      'sr-only',
      'lg:not-sr-only',
    );
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
    expect(screen.getByText('EcoTrack')).toBeInTheDocument();
    expect(screen.getByText('Profit × is above break-even')).toBeInTheDocument();
    expect(screen.getByText('Profit')).toBeInTheDocument();
    expect(screen.getByText('Submitted · unconfirmed')).toBeInTheDocument();
    expect(screen.getByText('Confirmed · unposted')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Cash pipeline' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByText('55% expected to post')).toBeInTheDocument();
    expect(screen.getByText('82% expected to post')).toBeInTheDocument();
    expect(screen.getByText('True profit').parentElement?.querySelector('strong')).not.toHaveClass(
      'truncate',
    );
    expect(screen.queryByText('Analytics · operational workspace')).not.toBeInTheDocument();
    expect(screen.queryByText('Query duration')).not.toBeInTheDocument();
  });

  it('localizes report content and controls instead of only translating the shell', () => {
    localeState.current = 'ar';
    renderWorkspace();

    expect(screen.getByText('نموذج الأيام السبعة القادمة')).toBeInTheDocument();
    expect(screen.getByText('مرسلة')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'نطاق التحليلات' })).toBeInTheDocument();
    expect(screen.queryByText('next 7-day model')).not.toBeInTheDocument();
  });

  it('keeps analytics context without adding generic assistant controls', () => {
    const { container } = renderWorkspaceWithContext();

    const cashSection = screen.getByText('Cash pipeline').closest('section');
    expect(cashSection).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Ask AI' })).not.toBeInTheDocument();
    expect(cashSection).toHaveAttribute('data-analytics-ai-focus', 'cash_pipeline');
    expect(cashSection).not.toHaveAttribute('data-analytics-ai-active');
    expect(
      container.querySelector('[data-analytics-ai-focus="economics_timeline"]'),
    ).toHaveAttribute('data-analytics-ai-active', 'true');
    expect(screen.getByTestId('surface-context')).toHaveTextContent(
      '"analyticsFocus":"economics_timeline"',
    );
  });

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

  it('makes product outcomes and customer paid contribution comparable', () => {
    renderWorkspace(catalogPayload());

    expect(screen.getAllByRole('region', { name: 'Exact values' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('region', { name: 'Exact values' })[0]).toHaveAttribute(
      'tabindex',
      '0',
    );
    expect(screen.getByText('Views →')).toBeInTheDocument();
    expect(screen.getByText('Paid outcome ↑')).toBeInTheDocument();
    expect(screen.getByText('Bubble · resolved orders')).toBeInTheDocument();
    const customerSection = screen.getByText('Customer base').closest('section');
    expect(customerSection).not.toBeNull();
    expect(
      within(customerSection as HTMLElement).getByRole('columnheader', { name: 'Paid' }),
    ).toBeInTheDocument();
    expect(
      within(customerSection as HTMLElement).getByRole('columnheader', {
        name: 'Paid revenue',
      }),
    ).toBeInTheDocument();
    expect(
      within(customerSection as HTMLElement).getByRole('columnheader', { name: 'Contribution' }),
    ).toBeInTheDocument();
    expect(
      within(customerSection as HTMLElement).getByRole('columnheader', { name: 'Margin' }),
    ).toBeInTheDocument();
    expect(within(customerSection as HTMLElement).getByText('DZD 10,000')).toBeInTheDocument();
    expect(within(customerSection as HTMLElement).getByText('30%')).toBeInTheDocument();
    expect(
      within(customerSection as HTMLElement).queryByRole('columnheader', { name: 'Order value' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Paid profit')).not.toBeInTheDocument();
  });

  it('suppresses immaterial cost coverage and settlement-source warnings', () => {
    const payload = commandPayload();
    payload.warnings = [
      { key: 'projectedCostCoverage', value: 99.8 },
      { key: 'sourceMissing', source: 'settlements' },
    ];

    renderWorkspace(payload);

    expect(
      screen.queryByText('Projected profit excludes incomplete purchase-cost orders'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('A source is missing for this range')).not.toBeInTheDocument();
  });

  it('does not revive source-cutoff alarms on frozen review routes', () => {
    const payload = commandPayload();
    payload.reviewClock = true;
    payload.sources = [
      { ...payload.sources[0]!, state: 'partial' },
      {
        key: 'storefront',
        state: 'partial',
        updatedAt: null,
        throughDate: '2026-08-17',
        records: 100,
        coveragePct: null,
      },
    ];
    payload.warnings = [
      { key: 'sourcePartial', source: 'orders', value: 100 },
      { key: 'sourcePartial', source: 'storefront' },
    ];

    renderWorkspace(payload);

    expect(screen.getAllByText('Current')).toHaveLength(2);
    expect(screen.queryByText('Partial')).not.toBeInTheDocument();
    expect(screen.queryByText('A source only covers part of this range')).not.toBeInTheDocument();
  });

  it('routes operator signals to the workspace that can resolve them', async () => {
    renderWorkspace();

    fireEvent.click(screen.getByRole('button', { name: /Profit × is above break-even/ }));

    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith('/en/stats/time?range=30d&grain=auto'),
    );
    expect(replaceMock).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Analytics view')).not.toBeInTheDocument();
  });

  it('does not fetch a custom range until Apply is used', async () => {
    renderWorkspace();
    const fetchMock = vi.mocked(fetch);

    fireEvent.click(screen.getByRole('button', { name: 'Custom' }));
    const dateInputs = screen.getAllByDisplayValue(/2026-/);
    fireEvent.change(dateInputs[0]!, { target: { value: '2026-08-01' } });
    fireEvent.change(dateInputs[1]!, { target: { value: '2026-08-10' } });
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(replaceMock).toHaveBeenCalledWith(
      '/en/stats?range=custom&grain=auto&startDate=2026-08-01&endDate=2026-08-10',
      { scroll: false },
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('range=custom');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('startDate=2026-08-01');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('endDate=2026-08-10');
  });

  it('edits an existing operating cost through the compatible update endpoint', async () => {
    renderWorkspace(assumptionsPayload());

    expect(screen.getByText('Default')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Workspace rent'));
    const nameInput = screen.getByDisplayValue('Workspace rent');
    const costForm = nameInput.closest('.mb-5');
    expect(costForm).not.toBeNull();
    fireEvent.change(nameInput, { target: { value: 'Warehouse rent' } });
    fireEvent.click(within(costForm as HTMLElement).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const updateCall = vi
        .mocked(fetch)
        .mock.calls.find(
          ([url, init]) =>
            String(url) === '/api/stats/profit-tracker/costs/7' && init?.method === 'PUT',
        );
      expect(updateCall).toBeDefined();
      expect(JSON.parse(String(updateCall?.[1]?.body))).toMatchObject({
        name: 'Warehouse rent',
        amountDzd: 60_000,
        period: 'monthly',
      });
    });
  });

  it('only enables reset when the selected day contains a manual override', () => {
    renderWorkspace(assumptionsPayload());

    fireEvent.click(screen.getByText('Aug 18, 2026'));
    expect(screen.getByRole('button', { name: 'Reset to automatic' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    fireEvent.click(screen.getByText('Promotion correction'));
    expect(screen.getByRole('button', { name: 'Reset to automatic' })).toBeEnabled();
  });
});
