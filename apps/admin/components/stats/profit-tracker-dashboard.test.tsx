import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProfitTrackerReport } from './profit-tracker-dashboard';
import { ProfitTrackerDashboard } from './profit-tracker-dashboard';

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values ? `${key}:${Object.values(values).join('|')}` : key,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/stats/costs',
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const report = {
  filters: { range: '30d', startDate: '2026-08-01', endDate: '2026-08-18' },
  settings: { fxRate: 280, defaultReturnRate: 10, restFrom: '2026-08-01' },
  summary: {
    spendEur: 100,
    rawAdCostDzd: 28_000,
    ratioAdCostDzd: 28_000,
    grossProfitDzd: 62_222.22,
    adjustedProfitDzd: 56_000,
    netProfitDzd: 28_000,
    operatingCostDzd: 3_000,
    trueProfitDzd: 25_000,
    profitX: 2,
    profitXBeforeReturns: 2.22,
    confirmedOrders: 18,
    fbPurchases: 24,
    costPerConfirmedDzd: 1_555.56,
    confirmationRatePct: 75,
    clickToPageRatePct: 80,
  },
  days: [
    {
      date: '2026-08-15',
      spendEur: 80,
      fbPurchases: 24,
      cpm: 4,
      ctr: 2,
      linkClicks: 100,
      landingPageViews: 80,
      grossProfitDzd: 62_222.22,
      returnRatePct: 10,
      confirmedOrders: 18,
      note: null,
      fxRateUsed: 280,
      metaSyncedAt: '2026-08-18T08:00:00.000Z',
      metrics: {
        adCostDzd: 28_000,
        adjustedProfitDzd: 56_000,
        netProfitDzd: 28_000,
        profitX: 2,
        netProfitBeforeReturnsDzd: 34_222.22,
        profitXBeforeReturns: 2.22,
        costPerConfirmedDzd: 1_555.56,
        confirmationRatePct: 75,
        clickToPageRatePct: 80,
      },
      isRestDay: false,
      rolledInDzd: 5_600,
      rolledOutDzd: 0,
      operatingCostDzd: 100,
      trueProfitDzd: 27_900,
      cumulativeNetDzd: 28_000,
      cumulativeNetBeforeReturnsDzd: 34_222.22,
      cumulativeTrueProfitDzd: 27_900,
    },
    {
      date: '2026-08-14',
      spendEur: 20,
      fbPurchases: 0,
      cpm: 3,
      ctr: 1,
      linkClicks: 20,
      landingPageViews: 14,
      grossProfitDzd: null,
      returnRatePct: null,
      confirmedOrders: null,
      note: null,
      fxRateUsed: 280,
      metaSyncedAt: '2026-08-18T08:00:00.000Z',
      metrics: {
        adCostDzd: 0,
        adjustedProfitDzd: null,
        netProfitDzd: null,
        profitX: null,
        netProfitBeforeReturnsDzd: null,
        profitXBeforeReturns: null,
        costPerConfirmedDzd: null,
        confirmationRatePct: null,
        clickToPageRatePct: 70,
      },
      isRestDay: true,
      rolledInDzd: 0,
      rolledOutDzd: 5_600,
      operatingCostDzd: 100,
      trueProfitDzd: null,
      cumulativeNetDzd: 0,
      cumulativeNetBeforeReturnsDzd: 0,
      cumulativeTrueProfitDzd: 0,
    },
  ],
  weeks: [
    {
      weekStart: '2026-08-14',
      trackedDays: 2,
      spendEur: 100,
      adCostDzd: 28_000,
      adjustedProfitDzd: 56_000,
      netProfitDzd: 28_000,
      operatingCostDzd: 700,
      trueProfitDzd: 27_300,
      profitX: 2,
    },
  ],
  costs: [
    {
      id: 1,
      name: 'Rent',
      amountDzd: 30_000,
      period: 'monthly' as const,
      startDate: '2026-08-01',
      endDate: null,
    },
  ],
  adsets: [
    {
      adsetId: 'adset-1',
      adsetName: 'Prospecting',
      days: 2,
      spendEur: 100,
      purchases: 24,
      purchaseValue: 1200,
      adCostDzd: 28_000,
      estimatedNetProfitDzd: 28_000,
      hasEstimate: true,
      costPerPurchaseDzd: 1_166.67,
    },
  ],
  freshness: { metaSyncedAt: '2026-08-18T08:00:00.000Z' },
} satisfies ProfitTrackerReport;

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProfitTrackerDashboard
        title="Profit tracker"
        description="Exact calculator analytics"
        initialData={report}
      />
    </QueryClientProvider>,
  );
}

describe('ProfitTrackerDashboard', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders calculator results and exposes the Friday carry', () => {
    renderDashboard();

    expect(screen.getAllByText('2×')).not.toHaveLength(0);
    expect(screen.getByText('profitTracker.history.rest')).toBeInTheDocument();
    expect(screen.getAllByText(/5,600/)).not.toHaveLength(0);
    expect(screen.getByText('Prospecting')).toBeInTheDocument();
  });

  it('does not fetch while a custom range is being edited and applies it once', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: report }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    renderDashboard();

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'profitTracker.rangeLabel' }),
      'custom',
    );
    await user.clear(screen.getByLabelText('customStart'));
    await user.type(screen.getByLabelText('customStart'), '2026-08-10');
    await user.clear(screen.getByLabelText('customEnd'));
    await user.type(screen.getByLabelText('customEnd'), '2026-08-15');

    expect(fetchMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'profitTracker.applyRange' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/stats/profit-tracker?range=custom&startDate=2026-08-10&endDate=2026-08-15',
        undefined,
      ),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
