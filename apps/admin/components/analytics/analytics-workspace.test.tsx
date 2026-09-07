import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AnalyticsPayload } from '../../lib/analytics';
import { AdminAiSurfaceProvider, useAdminAiSurfaceContext } from '../admin-ai-surface-context';
import { StatsWorkspace } from './analytics-workspace';
import { completedTrendBuckets, splitPartialSeries } from './analytics-workspace-primitives';

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

  it('requests a fresh calculation when Refresh is clicked', async () => {
    renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toContain('refresh=1');
  });

  it('shows a stale server result while checking for its background replacement', async () => {
    const payload = commandPayload();
    payload.diagnostics.cache = { state: 'stale', computedAt: '2026-08-19T12:00:00Z' };
    renderWorkspace(payload);
    expect(screen.getByText('Profit')).toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).not.toContain('refresh=1');
  });

  it('polls stale snapshots until a fresh replacement arrives, then stops', async () => {
    vi.useFakeTimers();
    try {
      const payload = commandPayload();
      payload.diagnostics.cache = { state: 'stale', computedAt: '2026-08-19T12:00:00Z' };
      const fresh = commandPayload();
      fresh.diagnostics.cache = { state: 'fresh', computedAt: fresh.generatedAt };
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ data: payload }),
      } as Response);
      fetchMock.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ data: fresh }),
      } as Response);

      renderWorkspace(payload);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Profit')).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled();
    } finally {
      cleanup();
      vi.useRealTimers();
    }
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
});
