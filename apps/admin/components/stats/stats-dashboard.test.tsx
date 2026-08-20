import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearToasts } from '../../lib/toast';
import { Toaster } from '../ui/toaster';
import { StatsDashboard, type StatsSection } from './stats-dashboard';

vi.mock('../file-upload-field', () => ({
  FileUploadField: ({
    label,
    onChange,
    onUploadStart,
    onUploaded,
  }: {
    label: string;
    onChange: (
      files: Array<{
        fileName: string;
        fileUrl: string;
        fileKey: string;
        contentType: string;
        size: number;
      }>,
    ) => void;
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

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    if (values) {
      return `${key}:${Object.values(values).join('|')}`;
    }

    return key;
  },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/stats',
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
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
      <StatsDashboard
        title="Stats"
        description="Stats page description"
        section={section}
        initialData={initialData}
      />
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
      paidAttribution: {
        visits: 80,
        createdOrders: 12,
        purchases: 8,
        landedOnly: 20,
        conversionRate: 10,
        topCampaigns: [{ name: 'Meta tools', visits: 80, orders: 12, purchases: 8 }],
      },
      commerce: {
        summary: {
          accountCurrency: 'EUR',
          spend: 1200,
          impressions: 20000,
          metaClicks: 900,
          metaLandingPageViews: 700,
          metaPurchases: 14,
          metaPurchaseValue: 2200,
          bricOrders: 18,
          confirmedOrders: 12,
          dispatchedOrders: 10,
          completedOrders: 8,
          cancelledOrders: 2,
          negativeOutcomeOrders: 1,
          paidOrders: 7,
          returnedOrders: 1,
          submittedValueDzd: 144000,
          costCompleteOrders: 18,
          settledOrders: 7,
          amountCollectedDzd: 110000,
          netRevenueDzd: 95000,
          metaSyncedAt: '2026-03-30T12:00:00.000Z',
        },
        rows: [
          {
            day: '2026-03-30',
            accountCurrency: 'EUR',
            campaignId: 'campaign-1',
            campaignName: 'Tool launch',
            adsetId: 'adset-1',
            adsetName: 'Prospecting',
            adId: 'ad-1',
            adName: 'Cordless drill video',
            spend: 1200,
            impressions: 20000,
            metaClicks: 900,
            metaLandingPageViews: 700,
            metaPurchases: 14,
            metaPurchaseValue: 2200,
            bricOrders: 18,
            confirmedOrders: 12,
            dispatchedOrders: 10,
            completedOrders: 8,
            cancelledOrders: 2,
            negativeOutcomeOrders: 1,
            paidOrders: 7,
            returnedOrders: 1,
            submittedValueDzd: 144000,
            costCompleteOrders: 18,
            estimatedProductCostDzd: null,
            estimatedDeliveryFeesDzd: 9000,
            settledOrders: 7,
            amountCollectedDzd: 110000,
            netRevenueDzd: 95000,
            realizedProfitDzd: null,
            metaSyncedAt: '2026-03-30T12:00:00.000Z',
          },
        ],
        sync: {
          status: 'succeeded',
          sinceDay: '2026-03-01',
          untilDay: '2026-03-30',
          rowsUpserted: 30,
          errorCode: null,
          startedAt: '2026-03-30T11:59:00.000Z',
          completedAt: '2026-03-30T12:00:00.000Z',
        },
      },
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
      funnel: [
        { name: 'Sessions', value: 1200 },
        { name: 'Product views', value: 1900 },
        { name: 'Adds to cart', value: 260 },
        { name: 'Checkout starts', value: 110 },
        { name: 'Purchases', value: 70 },
      ],
      topSearches: [{ term: 'drill', searches: 30, zeroResults: 2 }],
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
      engagedSessions: 720,
      engagementRate: 60,
      returningJourneys: 180,
      errorEvents: 12,
      errorRate: 1,
      pageTypes: [{ name: 'catalog', sessions: 500, pageViews: 900, interactions: 240 }],
      locales: [{ name: 'fr', sessions: 800, pageViews: 3000, purchases: 50 }],
      devices: [{ name: 'mobile', sessions: 900, pageViews: 3500 }],
      vitals: [
        { name: 'LCP', samples: 100, average: 2200, good: 75, needsImprovement: 20, poor: 5 },
      ],
      acquisitionSources: [
        {
          name: 'direct_dark_social',
          sessions: 500,
          orders: 20,
          successfulOrders: 14,
          conversionRate: 4,
        },
      ],
      acquisitionCoverageStartsAt: '2026-03-01T00:00:00.000Z',
      trend: [{ bucket: '2026-03-30', sessions: 120, pageViews: 480, purchases: 7, errors: 1 }],
    },
    landingPages: {
      summary: {
        total: 3,
        published: 2,
        drafts: 1,
        sessions: 100,
        productViews: 90,
        addToCarts: 20,
        checkoutStarts: 10,
        purchases: 6,
        revenue: 72000,
        conversionRate: 6,
      },
      pages: [
        {
          id: 4,
          slug: 'drill-offer',
          locale: 'fr',
          status: 'published',
          product: 'Cordless Drill',
          revision: 2,
          sessions: 100,
          productViews: 90,
          addToCarts: 20,
          checkoutStarts: 10,
          purchases: 6,
          revenue: 72000,
          conversionRate: 6,
        },
      ],
      blocks: [{ name: 'hero', interactions: 30, addToCarts: 10, checkouts: 4 }],
    },
    aiAssistants: {
      admin: {
        runs: 12,
        completed: 10,
        failed: 2,
        successRate: 83.3,
        conversations: 4,
        activeUsers: 2,
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1500,
        estimatedCostUsd: 0.01,
        costCoverageRate: 100,
        averageDurationMs: 1200,
        toolCalls: 8,
        proposals: 6,
        appliedProposals: 3,
        topTasks: [{ name: 'product_content', runs: 5, successRate: 100, tokens: 600 }],
        models: [{ name: 'gpt-test', runs: 12, tokens: 1500 }],
        trend: [{ bucket: '2026-03-30', runs: 4, completed: 3, failed: 1, tokens: 500 }],
      },
      storefront: {
        enabled: true,
        runs: 20,
        completed: 18,
        failed: 2,
        successRate: 90,
        conversations: 14,
        activeUsers: 14,
        inputTokens: 2000,
        outputTokens: 900,
        totalTokens: 2900,
        estimatedCostUsd: 0.02,
        costCoverageRate: 100,
        averageDurationMs: 900,
        toolCalls: 24,
        proposals: 0,
        appliedProposals: 0,
        topTasks: [{ name: 'product_search', runs: 10, successRate: 90, tokens: 1200 }],
        models: [{ name: 'gpt-test', runs: 20, tokens: 2900 }],
        trend: [{ bucket: '2026-03-30', runs: 8, completed: 7, failed: 1, tokens: 1000 }],
        opens: 40,
        messages: 25,
        resultClicks: 10,
        errors: 2,
        clickThroughRate: 40,
        influencedOrders: 8,
        confirmedOrders: 5,
        completedOrders: 3,
        paidOrders: 2,
        recommendedProductOrders: 4,
        submittedValueDzd: 80000,
        confirmationRate: 62.5,
        usageCoverageStartsAt: '2026-03-01T00:00:00.000Z',
        topIntents: [{ name: 'product_search', messages: 12 }],
      },
    },
    customers: {
      summary: {
        customers: 10,
        successfulOrders: 15,
        repeatCustomers: 3,
        confirmedCustomers: 7,
        repeatRate: 30,
        averageOrders: 1.5,
        averageOrderValue: 10000,
      },
      customers: [
        {
          phone: '0555000000',
          name: 'Ada Doe',
          city: 'Alger',
          orders: 3,
          confirmedOrders: 2,
          totalValue: 30000,
          averageOrderValue: 10000,
          firstOrderAt: '2026-03-01T00:00:00.000Z',
          lastOrderAt: '2026-03-30T00:00:00.000Z',
          products: [{ name: 'Cordless Drill', count: 2 }],
        },
      ],
    },
    wilayas: [{ name: 'Alger', orders: 5, revenue: 40000, profit: 18000 }],
    wilayaDetails: [
      {
        name: 'Alger',
        orders: 5,
        collected: 45000,
        fees: 3500,
        revenue: 40000,
        profit: 18000,
        avgOrder: 8000,
      },
    ],
    deliveries: [
      { name: 'Home', orders: 7, revenue: 75000, profit: 33000, fees: 6500, netRevenue: 68500 },
    ],
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
    topCategories: [
      {
        id: 'tools',
        title: 'Tools',
        unitsSold: 12,
        revenue: 64000,
        cost: 32000,
        profit: 32000,
        margin: 50,
        sku: null,
        categoryName: 'Tools',
        brandName: null,
      },
    ],
    topBrands: [
      {
        id: 'makita',
        title: 'Makita',
        unitsSold: 12,
        revenue: 64000,
        cost: 32000,
        profit: 32000,
        margin: 50,
        sku: null,
        categoryName: null,
        brandName: 'Makita',
      },
    ],
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
        skippedRows: 1,
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
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/stats/overview?range=30d',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('waits for Apply before fetching a custom date range', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => baseResponse });
    vi.stubGlobal('fetch', fetchMock);
    renderDashboard('overview');
    await screen.findAllByText('Stats');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: 'ranges.custom' }));
    await userEvent.type(screen.getByLabelText('customStart'), '2026-08-01');
    await userEvent.type(screen.getByLabelText('customEnd'), '2026-08-15');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: 'profitTracker.applyRange' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/stats/overview?range=custom&startDate=2026-08-01&endDate=2026-08-15',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ),
    );
  });

  it('uses server-provided initial data for the default overview render', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    renderDashboard('overview', baseResponse.data);

    expect((await screen.findAllByText('Stats')).length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rebuilds dashboard stats when refresh is clicked', async () => {
    const refreshedResponse = {
      data: {
        ...baseResponse.data,
        adCosts: {
          ...baseResponse.data.adCosts,
          totalSpend: 0,
        },
      },
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/stats/overview' && init?.method === 'PUT') {
        return {
          ok: true,
          json: async () => refreshedResponse,
        };
      }

      return {
        ok: true,
        json: async () => baseResponse,
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    renderDashboard('overview', baseResponse.data);

    await userEvent.click(screen.getByRole('button', { name: 'refresh' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/stats/overview',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ range: '30d', section: 'overview' }),
        }),
      );
    });
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
    expect((await screen.findAllByText('Product 1')).length).toBeGreaterThan(0);
    expect(screen.queryByText('Product 11')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'labels.goToPage:2' }));

    expect((await screen.findAllByText('Product 11')).length).toBeGreaterThan(0);
  });

  it('renders the meta ads stats page', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => baseResponse,
    });
    vi.stubGlobal('fetch', fetchMock);

    renderDashboard('metaAds');

    expect((await screen.findAllByText('Stats')).length).toBeGreaterThan(0);
    expect(screen.getByText('metaAds.paidAttribution.title')).toBeInTheDocument();
    expect(screen.getByText('metaAds.paidAttribution.description')).toBeInTheDocument();
    expect(screen.getByText('metaAds.performance.trackingHealth')).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('keeps first-party Meta evidence useful when direct Insights is not configured', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const withoutDirectInsights = {
      ...baseResponse.data,
      metaAds: {
        ...baseResponse.data.metaAds,
        commerce: {
          ...baseResponse.data.metaAds.commerce,
          summary: {
            ...baseResponse.data.metaAds.commerce.summary,
            accountCurrency: null,
            spend: 0,
            metaClicks: 0,
          },
          rows: [],
          sync: null,
        },
      },
    };

    renderDashboard('metaAds', withoutDirectInsights);

    expect(await screen.findByText('metaAds.paidAttribution.title')).toBeInTheDocument();
    expect(screen.queryByText('metaAds.integrated.title')).not.toBeInTheDocument();
    expect(screen.queryByText('website.channels.direct_dark_social')).not.toBeInTheDocument();
  });

  it('presents website analytics as a mobile-safe decision dashboard', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const user = userEvent.setup();

    const { container } = renderDashboard('website', baseResponse.data);

    expect(await screen.findByText('website.audienceTitle')).toBeInTheDocument();
    expect(screen.getByText('website.cards.orders')).toBeInTheDocument();
    expect(screen.getByText('website.cards.orderRate')).toBeInTheDocument();
    expect(screen.queryByText('website.commerce.description')).not.toBeInTheDocument();
    expect(screen.queryByText('website.acquisitionDescription')).not.toBeInTheDocument();
    expect(screen.queryByText('website.errorsTitle')).not.toBeInTheDocument();
    expect(screen.getByText('website.pageTypes.catalog')).toBeInTheDocument();
    expect(screen.getByText('website.devicesMap.mobile')).toBeInTheDocument();
    expect(screen.queryByText('website.cards.purchaseRate')).not.toBeInTheDocument();

    const sectionCards = container.querySelectorAll('[data-slot="stats-section-card"]');
    expect(sectionCards.length).toBeGreaterThan(0);
    sectionCards.forEach((card) => {
      expect(card).toHaveClass('min-w-0', 'max-w-full');
    });

    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    const ordersTrend = screen.getByRole('button', {
      name: 'website.trendMetrics.orders',
    });
    expect(ordersTrend).toHaveAttribute('aria-pressed', 'false');
    await user.click(ordersTrend);
    expect(ordersTrend).toHaveAttribute('aria-pressed', 'true');

    const productTitle = screen.getByRole('heading', { name: 'Cordless Drill' });
    expect(productTitle).toHaveClass('break-words');
    expect(productTitle.closest('article')).toHaveClass('min-w-0');
  });

  it('shows source rates for the evidence window when a wider range predates coverage', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const partialCoverage = {
      ...baseResponse.data,
      website: {
        ...baseResponse.data.website,
        acquisitionCoverageStartsAt: '2026-03-15T00:00:00.000Z',
      },
    };

    renderDashboard('website', partialCoverage);

    expect(await screen.findByText(/^website\.acquisitionCoverage:/)).toBeInTheDocument();
    expect(screen.queryByText('website.acquisitionRateUnavailable')).not.toBeInTheDocument();
  });

  it.each(['landingPages', 'customers', 'products', 'geography'] as const)(
    'uses mobile record cards instead of wide tables on the %s analytics page',
    async (section) => {
      vi.stubGlobal('fetch', vi.fn());
      const data =
        section === 'geography'
          ? {
              ...baseResponse.data,
              wilayaDetails: baseResponse.data.wilayaDetails.map((item) => ({
                ...item,
                orders: 15,
              })),
            }
          : baseResponse.data;
      const { container } = renderDashboard(section, data);

      expect(await screen.findAllByText('Stats')).not.toHaveLength(0);
      const mobileCards = container.querySelectorAll('[data-slot="stats-mobile-breakdown"]');
      expect(mobileCards.length).toBeGreaterThan(0);
      mobileCards.forEach((card) => expect(card.parentElement).toHaveClass('md:hidden'));
      screen.getAllByRole('table').forEach((table) => {
        expect(table.parentElement).toHaveClass('overflow-x-auto', 'md:block');
      });
    },
  );

  it('removes the obsolete spreadsheet chronology from Time', async () => {
    vi.stubGlobal('fetch', vi.fn());
    renderDashboard('time', baseResponse.data);
    expect(await screen.findByText('time.orders.title')).toBeInTheDocument();
    expect(screen.queryByText('time.imports.title')).not.toBeInTheDocument();
  });

  it('distinguishes live order counts from lagging courier financial coverage', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => baseResponse }));
    const laggingData = {
      ...baseResponse.data,
      snapshot: {
        generatedAt: '2026-08-17T02:11:00.000Z',
        staleAt: '2026-08-18T02:11:00.000Z',
        isStale: false,
        trigger: 'daily-schedule',
        sourceImportBatchId: null,
        reportThroughDate: '2026-06-30',
        financialDataIsLagging: true,
      },
    };

    renderDashboard('overview', laggingData);

    expect(await screen.findByText('snapshotMeta.financialLagTitle')).toBeInTheDocument();
    expect(screen.getByText(/^snapshotMeta\.financialLagDescription:/)).toBeInTheDocument();
  });

  it.each([
    ['landingPages', 'landingPages.performanceTitle', 'drill-offer'],
    ['aiAssistants', 'aiAssistants.storefront.impactTitle', 'aiAssistants.admin.title'],
    ['customers', 'customers.rankingTitle', '0555000000'],
  ] as const)('renders the %s stats page', async (section, heading, detail) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => baseResponse }));
    renderDashboard(section);
    expect(await screen.findByText(heading)).toBeInTheDocument();
    expect((await screen.findAllByText(detail)).length).toBeGreaterThan(0);
  });

  it('always refreshes the AI assistant section instead of retaining stale zero metrics', async () => {
    const staleData = {
      ...baseResponse.data,
      aiAssistants: {
        ...baseResponse.data.aiAssistants,
        admin: { ...baseResponse.data.aiAssistants.admin, runs: 0, successRate: 0, totalTokens: 0 },
      },
    };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => baseResponse });
    vi.stubGlobal('fetch', fetchMock);

    renderDashboard('aiAssistants', staleData);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/stats?range=30d&section=aiAssistants',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ),
    );
    expect(await screen.findByText('83.3%')).toBeInTheDocument();
  });

  it('prioritizes shopper impact over admin assistant operations', async () => {
    vi.stubGlobal('fetch', vi.fn());
    renderDashboard('aiAssistants', baseResponse.data);

    const impactHeading = await screen.findByText('aiAssistants.storefront.impactTitle');
    const adminHeading = screen.getByText('aiAssistants.admin.title');
    expect(
      impactHeading.compareDocumentPosition(adminHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByText('aiAssistants.cards.submittedValue')).toBeInTheDocument();
    expect(screen.queryByText('aiAssistants.cards.influenceShare')).not.toBeInTheDocument();
    expect(screen.getByText('aiAssistants.admin.modelsTitle')).toBeInTheDocument();
    expect(screen.queryByText('aiAssistants.storefront.modelsTitle')).not.toBeInTheDocument();
  });

  it('keeps partial assistant coverage out of the presentation copy', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const partialCoverage = {
      ...baseResponse.data,
      aiAssistants: {
        ...baseResponse.data.aiAssistants,
        storefront: {
          ...baseResponse.data.aiAssistants.storefront,
          usageCoverageStartsAt: '2026-03-15T00:00:00.000Z',
        },
      },
    };

    renderDashboard('aiAssistants', partialCoverage);

    expect(await screen.findByText('aiAssistants.storefront.impactTitle')).toBeInTheDocument();
    expect(screen.queryByText('aiAssistants.storefront.coverage')).not.toBeInTheDocument();
    expect(
      screen.queryByText('aiAssistants.storefront.coverageRateUnavailable'),
    ).not.toBeInTheDocument();
  });

  it('explains zero storefront assistant metrics when the feature is disabled', async () => {
    const disabledData = {
      ...baseResponse.data,
      aiAssistants: {
        ...baseResponse.data.aiAssistants,
        storefront: {
          ...baseResponse.data.aiAssistants.storefront,
          enabled: false,
          runs: 0,
          messages: 0,
        },
      },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: disabledData }) }),
    );

    renderDashboard('aiAssistants', disabledData);

    expect(await screen.findByText('aiAssistants.storefront.disabledTitle')).toBeInTheDocument();
    expect(screen.getByText('aiAssistants.storefront.disabledDescription')).toBeInTheDocument();
  });

  it('shows successful order volume instead of the redundant confirmed-customer card', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => baseResponse }));
    renderDashboard('customers');

    expect(await screen.findByText('customers.cards.successfulOrders')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.queryByText('customers.cards.confirmed')).not.toBeInTheDocument();
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
            job:
              statsImportJobFetchCount < 2
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

    expect((await screen.findAllByText('notifications.upload.success:4|1')).length).toBeGreaterThan(
      0,
    );

    const deleteButtons = screen.getAllByRole('button', { name: 'imports.delete' });
    await userEvent.click(
      deleteButtons.find((button) => !button.hasAttribute('disabled')) ?? deleteButtons[0],
    );

    expect(
      (await screen.findAllByText('notifications.delete.success:batch-1')).length,
    ).toBeGreaterThan(0);

    await userEvent.click(screen.getAllByRole('button', { name: 'ref-404' })[0]);
    await userEvent.click(screen.getByRole('button', { name: 'unmatched.dismiss' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/stats?batchId=batch-1',
        expect.objectContaining({ method: 'DELETE' }),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/stats?history=true&page=2&pageSize=10',
        undefined,
      );
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
