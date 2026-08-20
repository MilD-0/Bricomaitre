import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Analytics2Payload } from '../../lib/analytics2';
import { Analytics2Workspace } from './analytics2-workspace';

const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }));

vi.mock('next-intl', () => ({ useLocale: () => 'en' }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/en/analytics2',
  useRouter: () => ({ replace: replaceMock }),
}));

function commandPayload(): Analytics2Payload {
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
    } as Analytics2Payload['data'],
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
  } as Analytics2Payload;
}

function assumptionsPayload(): Analytics2Payload {
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
        adjustedProfit: 'grossProfitDzd * (1 - returnRatePct / 100)',
        netProfit: 'adjustedProfitDzd - adCostDzd',
        profitX: 'adjustedProfitDzd / adCostDzd',
        trueProfit: 'netProfitDzd - operatingCostDzd',
      },
    } as Analytics2Payload['data'],
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
  } as Analytics2Payload;
}

function searchPayload(): Analytics2Payload {
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
  } as Analytics2Payload;
}

function renderWorkspace(payload = commandPayload()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Analytics2Workspace initialData={payload} />
    </QueryClientProvider>,
  );
}

describe('Analytics2Workspace', () => {
  beforeEach(() => {
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

  it('renders a lean operational workspace with source health and operator signals', () => {
    const { container } = renderWorkspace();

    expect(container.querySelector('[data-admin-workspace="analytics2"]')).toBeInTheDocument();
    expect(screen.getByText('EcoTrack')).toBeInTheDocument();
    expect(screen.getByText('Profit × is above break-even')).toBeInTheDocument();
    expect(screen.getByText('Business trajectory')).toBeInTheDocument();
    expect(screen.queryByText('Analytics · operational workspace')).not.toBeInTheDocument();
    expect(screen.queryByText('Query duration')).not.toBeInTheDocument();
  });

  it('presents Search Console as a focused opportunity workspace', () => {
    renderWorkspace(searchPayload());

    expect(screen.getByText('Google Search')).toBeInTheDocument();
    expect(screen.getAllByText('perceuse sans fil').length).toBeGreaterThan(0);
    expect(screen.getByText('3,521 URLs')).toBeInTheDocument();
    expect(screen.queryByText('Non-brand discovery')).not.toBeInTheDocument();
    expect(screen.queryByText('Query-detail coverage')).not.toBeInTheDocument();
    expect(screen.queryByText('Query and page detail is privacy-limited by Google')).not.toBeInTheDocument();
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

  it('routes operator signals to the workspace that can resolve them', async () => {
    renderWorkspace();

    fireEvent.click(screen.getByRole('button', { name: /Profit × is above break-even/ }));

    await waitFor(() =>
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        expect.stringContaining('view=money'),
        expect.any(Object),
      ),
    );
    expect(replaceMock).toHaveBeenCalledWith(expect.stringContaining('view=money'), {
      scroll: false,
    });
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
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('range=custom');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('startDate=2026-08-01');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('endDate=2026-08-10');
  });

  it('edits an existing operating cost through the compatible update endpoint', async () => {
    renderWorkspace(assumptionsPayload());

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
