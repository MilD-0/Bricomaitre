import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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

function storefrontPayload(): AnalyticsPayload {
  const base = commandPayload();
  return {
    ...base,
    view: 'storefront',
    filters: { ...base.filters, view: 'storefront' },
    data: {
      kind: 'storefront',
      metrics: [],
      funnel: [],
      funnelRange: { startDate: '2026-08-13', endDate: '2026-08-19' },
      trend: [],
      searches: [],
      acquisitionSources: [],
      vitals: [],
      paths: { coverageStartDate: '2026-08-13', coverageEndDate: '2026-08-19', rows: [] },
      landingPages: { pages: [] },
      aiAssistant: {
        opens: 0,
        messages: 0,
        resultClicks: 0,
        influencedOrders: 0,
        confirmedOrders: 0,
        paidOrders: 0,
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

  it('only enables reset when the selected day contains a manual override', () => {
    renderWorkspace(assumptionsPayload());

    fireEvent.click(screen.getByText('Aug 18, 2026'));
    expect(screen.getByRole('button', { name: 'Reset to automatic' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    fireEvent.click(screen.getByText('Promotion correction'));
    expect(screen.getByRole('button', { name: 'Reset to automatic' })).toBeEnabled();
  });
  it('makes failed storefront details recoverable and refreshes them with the report', async () => {
    let attempts = 0;
    const base = storefrontPayload();
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (String(url).startsWith('/api/stats/storefront-details')) {
        attempts += 1;
        if (attempts === 1)
          return new Response(JSON.stringify({ error: 'Temporary reporting failure' }), {
            status: 503,
          });
        return Response.json({
          data: {
            ...base.data,
            acquisitionSources: [
              { name: `Recovered source ${attempts}`, sessions: 10, conversionRate: 20 },
            ],
          },
        });
      }
      return Response.json({ data: base });
    });
    renderWorkspace(base);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Analytics request failed.');
    fireEvent.click(within(alert).getByRole('button', { name: 'Refresh' }));
    await screen.findByText('Recovered source 2');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await screen.findByText('Recovered source 3');
    expect(attempts).toBe(3);
  });
});
