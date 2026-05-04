import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearToasts } from '../lib/toast';
import { Toaster } from './ui/toaster';
import { StatsDashboard, type StatsSection } from './stats-dashboard';

vi.mock('./file-upload-field', () => ({
  FileUploadField: ({
    label,
    onChange,
    onUploadStart,
    onUploaded,
  }: {
    label: string;
    onChange: (files: Array<{ fileName: string; fileUrl: string; fileKey: string; contentType: string; size: number }>) => void;
    onUploadStart?: () => void;
    onUploaded?: (payload: { file: unknown; body: unknown }) => void;
  }) => (
    <button
      type="button"
      onClick={() => {
        onUploadStart?.();
        const file = {
          fileName: 'april.xlsx',
          fileUrl: 'https://stats-import.local/batch-2',
          fileKey: 'batch-2',
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          size: 5,
        };
        onChange([file]);
        Promise.resolve().then(() =>
          onUploaded?.({
            file,
            body: {
              job: {
                id: 'job-2',
                status: 'queued',
              },
            },
          }),
        );
      }}
    >
      {label}
    </button>
  ),
}));

vi.mock('./manual-order-history', () => ({
  ManualOrderHistory: () => <div>manual-order-history</div>,
}));

vi.mock('./manual-order-form', () => ({
  ManualOrderForm: ({ mode, open }: { mode?: 'dialog' | 'inline'; open?: boolean }) =>
    mode === 'inline' || open ? <div>manual-order-form</div> : null,
}));

vi.mock('./ad-costs-manager', () => ({
  AdCostsManager: ({ range, startDate, endDate }: { range: string; startDate?: string; endDate?: string }) => (
    <div>{`ad-costs-manager:${range}:${startDate ?? ''}:${endDate ?? ''}`}</div>
  ),
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    if (values) {
      return `${key}:${Object.values(values).join('|')}`;
    }

    return key;
  },
}));

function renderDashboard(section: StatsSection, initialData?: typeof baseResponse.data) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <StatsDashboard title="Stats" description="Stats page description" section={section} initialData={initialData} />
      <Toaster />
    </QueryClientProvider>,
  );
}

const baseResponse = {
  data: {
    filters: { range: '90d', startDate: '2026-01-01', endDate: '2026-03-30' },
    summary: {
      totalOrders: 12,
      totalAmountCollected: 120000,
      totalFees: 10000,
      totalNetRevenue: 110000,
      totalProductCost: 60000,
      totalGrossProfit: 50000,
      adSpend: 7000,
      netProfitAfterAds: 43000,
      averageOrderValue: 10000,
      averageProfitPerOrder: 4166,
      profitMargin: 45.5,
      profitMarginAfterAds: 39.1,
      fulfillmentRate: 60,
      matchedOrders: 12,
      totalConfirmedOrders: 20,
      profitableOrders: 10,
      unprofitableOrders: 1,
      breakEvenOrders: 1,
    },
    trends: {
      daily: [
        { bucket: '2026-03-01', orders: 3, revenue: 20000, profit: 9000, fees: 2500 },
        { bucket: '2026-03-02', orders: 2, revenue: 17000, profit: 7000, fees: 1900 },
      ],
      weekly: [{ bucket: '2026-03-02', orders: 12, revenue: 110000, profit: 50000, fees: 10000 }],
      monthly: [{ bucket: '2026-03', orders: 12, revenue: 110000, profit: 50000, fees: 10000 }],
      imports: [{ bucket: '2026-03-28', orders: 12, revenue: 110000, profit: 50000, fees: 10000 }],
    },
    feeBreakdown: {
      livraison: 7000,
      poids: 1200,
      extra: 400,
      sms: 250,
      stockage: 150,
      commission: 1000,
      total: 10000,
      avgPerOrder: 833,
    },
    adCosts: {
      totalSpend: 7000,
      roas: 15.7,
      cpa: 583,
      cpc: 45,
      ctr: 2.3,
      conversionRate: 5.4,
    },
    metaAds: {
      events: [
        {
          name: 'ViewContent',
          total: 18,
          pixelFired: 18,
          capiSent: 18,
          capiDelivered: 16,
          capiFailed: 2,
          lastOccurredAt: '2026-03-30T11:45:00.000Z',
        },
      ],
      recentPayloads: [
        {
          eventId: 'meta-evt-1',
          analyticsEventName: 'view_item',
          metaEventName: 'ViewContent',
          pagePath: '/products/drill',
          occurredAt: '2026-03-30T11:45:00.000Z',
          pixelPayload: {
            content_ids: ['1'],
            value: 64000,
            currency: 'DZD',
          },
          capiPayload: {
            content_ids: ['1'],
            value: 64000,
            currency: 'DZD',
          },
          capiStatus: 200,
          capiOk: true,
        },
      ],
    },
    website: {
      sessions: 1200,
      journeys: 950,
      pageViews: 4800,
      productViews: 1900,
      addToCarts: 260,
      checkoutStarts: 110,
      purchases: 70,
      searches: 180,
      zeroResultSearches: 22,
      sessionConversionRate: 5.8,
      viewToCartRate: 13.7,
      cartToPurchaseRate: 26.9,
      checkoutToPurchaseRate: 63.6,
      variants: [
        {
          variant: 'new',
          sessions: 700,
          pageViews: 2900,
          productViews: 1200,
          addToCarts: 170,
          checkoutStarts: 80,
          purchases: 48,
          sessionConversionRate: 6.9,
          cartToPurchaseRate: 28.2,
          checkoutToPurchaseRate: 60,
        },
        {
          variant: 'legacy',
          sessions: 500,
          pageViews: 1900,
          productViews: 700,
          addToCarts: 90,
          checkoutStarts: 30,
          purchases: 22,
          sessionConversionRate: 4.4,
          cartToPurchaseRate: 24.4,
          checkoutToPurchaseRate: 73.3,
        },
      ],
      funnel: [
        { name: 'Sessions', value: 1200 },
        { name: 'Product views', value: 1900 },
        { name: 'Adds to cart', value: 260 },
        { name: 'Checkout starts', value: 110 },
        { name: 'Purchases', value: 70 },
      ],
      topSearches: [{ term: 'drill', searches: 30, zeroResults: 2 }],
      topLandingPages: [{ path: '/products/drill', sessions: 140 }],
      topProducts: [
        {
          id: '1',
          title: 'Cordless Drill',
          sku: 'DRL-1',
          categoryName: 'Tools',
          viewCount: 500,
          addToCartCount: 72,
          websitePurchaseCount: 21,
          websiteConversionRate: 4.2,
        },
      ],
    },
    wilayas: [{ name: 'Alger', orders: 5, revenue: 40000, profit: 18000 }],
    wilayaDetails: [{ name: 'Alger', orders: 5, collected: 45000, fees: 3500, revenue: 40000, profit: 18000, avgOrder: 8000 }],
    deliveries: [{ name: 'Home', orders: 7, revenue: 75000, profit: 33000, fees: 6500, netRevenue: 68500 }],
    topProducts: [
      {
        id: '1',
        title: 'Cordless Drill',
        unitsSold: 12,
        revenue: 64000,
        cost: 32000,
        profit: 32000,
        margin: 50,
        sku: 'DRL-1',
        categoryName: 'Tools',
        brandName: 'Makita',
        totalOrderCount: 18,
        confirmedOrderCount: 12,
        confirmationRate: 66.7,
      },
    ],
    allProducts: [
      {
        id: '1',
        title: 'Cordless Drill',
        unitsSold: 12,
        revenue: 64000,
        cost: 32000,
        profit: 32000,
        margin: 50,
        sku: 'DRL-1',
        categoryName: 'Tools',
        brandName: 'Makita',
        totalOrderCount: 18,
        confirmedOrderCount: 12,
        confirmationRate: 66.7,
      },
    ],
    topCategories: [{ id: 'tools', title: 'Tools', unitsSold: 12, revenue: 64000, cost: 32000, profit: 32000, margin: 50, sku: null, categoryName: 'Tools', brandName: null }],
    topBrands: [{ id: 'makita', title: 'Makita', unitsSold: 12, revenue: 64000, cost: 32000, profit: 32000, margin: 50, sku: null, categoryName: null, brandName: 'Makita' }],
    profitability: [
      { name: 'Profitable', value: 10, fill: 'var(--chart-2)' },
      { name: 'Break-even', value: 1, fill: 'var(--chart-4)' },
      { name: 'Loss-making', value: 1, fill: 'var(--chart-5)' },
    ],
    importHistory: [
      {
        id: 1,
        batchId: 'batch-1',
        fileName: 'march.xlsx',
        importedAt: '2026-03-30T10:00:00.000Z',
        totalRows: 15,
        matchedOrders: 12,
        unmatchedCount: 2,
        unmatchedReferences: ['ref-404'],
        unmatchedDetails: [
          {
            reference: 'ref-404',
            tracking: 'trk-404',
            customerName: 'Ada',
            phone: '0555000000',
            wilaya: 'Alger',
            commune: 'Bab Ezzouar',
            amountCollected: 1500,
            products: 'Cordless Drill',
            note: 'Missing DB order',
          },
        ],
        dateRangeStart: '2026-03-01',
        dateRangeEnd: '2026-03-30',
      },
    ],
    latestUnmatchedReferences: ['ref-404'],
    latestUnmatchedDetails: [
      {
        batchId: 'batch-1',
        reference: 'ref-404',
        tracking: 'trk-404',
        customerName: 'Ada',
        phone: '0555000000',
        wilaya: 'Alger',
        commune: 'Bab Ezzouar',
        amountCollected: 1500,
        products: 'Cordless Drill',
        note: 'Missing DB order',
      },
    ],
  },
};

describe('StatsDashboard', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    clearToasts();
    vi.restoreAllMocks();
  });

  it('shows the loading skeleton before stats resolve', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise(() => {
            // Keep pending to assert the loading shell.
          }),
      ),
    );

    const { container } = renderDashboard('overview');

    expect(container.querySelector('.animate-pulse.rounded-full.bg-primary\\/60')).toBeTruthy();
  });

  it('renders the overview stats page', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => baseResponse,
    });
    vi.stubGlobal('fetch', fetchMock);

    renderDashboard('overview');

    expect((await screen.findAllByText('Stats')).length).toBeGreaterThan(0);
    expect(screen.queryByText('march.xlsx')).not.toBeInTheDocument();
    expect(screen.queryByText('manual-order-history')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/stats?range=90d', undefined);
  });

  it('uses server-provided initial data for the default overview render', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    renderDashboard('overview', baseResponse.data);

    expect((await screen.findAllByText('Stats')).length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renders the products stats page', async () => {
    const paginatedResponse = {
      ...baseResponse,
      data: {
        ...baseResponse.data,
        allProducts: Array.from({ length: 21 }, (_, index) => ({
          id: String(index + 1),
          title: `Product ${index + 1}`,
          unitsSold: index + 1,
          revenue: 5000 + index,
          cost: 2500 + index,
          profit: 2500,
          margin: 50,
          sku: `SKU-${index + 1}`,
          categoryName: 'Tools',
          brandName: 'Makita',
          totalOrderCount: 20,
          confirmedOrderCount: 14,
          confirmationRate: 70,
        })),
      },
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => paginatedResponse,
    });
    vi.stubGlobal('fetch', fetchMock);

    renderDashboard('products');

    expect((await screen.findAllByText('Stats')).length).toBeGreaterThan(0);
    expect(await screen.findByText('Product 11')).toBeInTheDocument();
    expect(screen.queryByText('Product 21')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'labels.goToPage:2' }));

    expect(await screen.findByText('Product 21')).toBeInTheDocument();
  });

  it('renders the meta ads stats page', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => baseResponse,
    });
    vi.stubGlobal('fetch', fetchMock);

    renderDashboard('metaAds');

    expect((await screen.findAllByText('Stats')).length).toBeGreaterThan(0);
    expect(screen.getByText('metaAds.performanceTitle')).toBeInTheDocument();
    expect(screen.getByText('ad-costs-manager:90d::')).toBeInTheDocument();

    const totalSpendCard = screen.getByText('overview.adPerformance.totalSpend').closest('div[class*="min-w-0"]')?.parentElement?.parentElement;
    expect(totalSpendCard?.firstElementChild).toHaveClass('bg-primary');
  });

  it('renders the manual orders stats page', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => baseResponse,
    });
    vi.stubGlobal('fetch', fetchMock);

    renderDashboard('manualOrders');

    expect((await screen.findAllByText('Stats')).length).toBeGreaterThan(0);
    expect(screen.getByText('manual-order-form')).toBeInTheDocument();
    expect(screen.getByText('manual-order-history')).toBeInTheDocument();
  });

  it('uploads and deletes import batches on the import history page', async () => {
    let statsImportJobFetchCount = 0;
    const historyRows = Array.from({ length: 11 }, (_, index) => ({
      ...baseResponse.data.importHistory[0],
      id: index + 1,
      batchId: `batch-${index + 1}`,
      fileName: `import-${index + 1}.xlsx`,
    }));
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/stats?range=90d') {
        return {
          ok: true,
          json: async () => baseResponse,
        };
      }

      if (url === '/api/uploads/stats') {
        statsImportJobFetchCount += 1;
        return {
          ok: true,
          json: async () => ({
            job: statsImportJobFetchCount < 2
              ? null
              : {
                  id: 'job-2',
                  status: 'completed',
                  resultSummary: { newOrders: 4, duplicateOrders: 1 },
                },
          }),
        };
      }

      if (url.startsWith('/api/stats?history=true')) {
        const params = new URL(`http://localhost${url}`).searchParams;
        const page = Number(params.get('page') ?? '1');
        const pageSize = Number(params.get('pageSize') ?? '10');
        const start = (page - 1) * pageSize;

        return {
          ok: true,
          json: async () => ({
            data: {
              items: historyRows.slice(start, start + pageSize),
              page,
              pageSize,
              totalItems: historyRows.length,
              totalPages: Math.ceil(historyRows.length / pageSize),
            },
          }),
        };
      }

      if (url.startsWith('/api/stats?batchId=') && init?.method === 'DELETE') {
        return {
          ok: true,
          json: async () => ({ data: { deletedOrders: 12, deletedBatch: { id: 1 } } }),
        };
      }

      if (url === '/api/stats' && init?.method === 'PATCH') {
        return {
          ok: true,
          json: async () => ({ data: { removed: true } }),
        };
      }

      return {
        ok: true,
        json: async () => baseResponse,
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    renderDashboard('imports');

    expect((await screen.findAllByText('Stats')).length).toBeGreaterThan(0);
    expect(await screen.findByText('import-10.xlsx')).toBeInTheDocument();
    expect(screen.queryByText('import-11.xlsx')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'labels.goToPage:2' }));

    expect(await screen.findByText('import-11.xlsx')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'upload.fieldLabel' })[0]);

    expect((await screen.findAllByText('notifications.upload.success:4|1')).length).toBeGreaterThan(0);

    const deleteButtons = screen.getAllByRole('button', { name: 'imports.delete' });
    await userEvent.click(deleteButtons.find((button) => !button.hasAttribute('disabled')) ?? deleteButtons[0]);

    expect((await screen.findAllByText('notifications.delete.success:batch-1')).length).toBeGreaterThan(0);

    await userEvent.click(screen.getAllByRole('button', { name: 'ref-404' })[0]);
    await userEvent.click(screen.getByRole('button', { name: 'unmatched.dismiss' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/stats?batchId=batch-1', expect.objectContaining({ method: 'DELETE' }));
      expect(fetchMock).toHaveBeenCalledWith('/api/stats?history=true&page=2&pageSize=10', undefined);
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/stats',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ batchId: 'batch-1', reference: 'ref-404' }),
        }),
      );
    });
  });
});
