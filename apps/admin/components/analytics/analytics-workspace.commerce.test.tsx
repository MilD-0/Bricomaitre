import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
    expect(window.location.pathname + window.location.search).toBe(
      '/en/stats?range=custom&grain=auto&startDate=2026-08-01&endDate=2026-08-10',
    );
    expect(replaceMock).not.toHaveBeenCalled();
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('range=custom');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('startDate=2026-08-01');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('endDate=2026-08-10');
  });
});
