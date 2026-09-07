import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DailyOrderStatusOverview, OrdersResponse } from '../../lib/order-admin-contracts';
import type { OrderRecord } from '../../lib/orders';
import { ORDER_STATUS } from '../../lib/orders';
import messages from '../../messages/en.json';
import { server } from '../../test/mocks/server';
import { OrdersWorkspace } from './orders-workspace';
import { formatOrderListTimestamp } from './orders-workspace-presenters';

function makeOrder(id: number, name: string, status: OrderRecord['inHouseStatus']): OrderRecord {
  return {
    id,
    publicToken: `token-${id}`,
    ecotrackTrackingNumber: null,
    variant: null,
    isDegradedCapture: false,
    createdAt: `2026-08-${String(id).padStart(2, '0')}T10:00:00.000Z`,
    updatedAt: '2026-08-18T10:00:00.000Z',
    firstName: name.split(' ')[0] ?? null,
    lastName: name.split(' ')[1] ?? null,
    fullName: name,
    email: null,
    phoneNumber1: `055500000${id}`,
    phoneNumber2: null,
    cartProducts: [String(id)],
    orderProducts: [
      {
        productId: id,
        slug: id === 1 ? 'cordless-drill' : 'tool-case',
        rawValue: String(id),
        title: id === 1 ? 'Cordless drill' : 'Tool case',
        unitPrice: 4000,
        quantity: 1,
        lineTotal: 4000,
        thumbnailUrl: null,
        missing: false,
      },
    ],
    delivery: 0,
    state: 16,
    city: id === 1 ? 'Algiers' : 'Blida',
    homeAddress: `${id} Workshop street`,
    subtotalOverride: null,
    productSubtotal: 4000,
    deliveryFee: 500,
    totalAmount: 4500,
    promoCode: null,
    promoProductId: null,
    promoOriginalSubtotal: null,
    promoDiscountAmount: 0,
    promoFinalSubtotal: null,
    note: id === 1 ? 'Call before delivery.' : null,
    inHouseStatus: status,
    noAnswerCount: status === 1 ? 1 : 0,
    confirmedBy: null,
    confirmedByName: null,
    confirmedAt: null,
    hasStatusHistory: false,
    statusHistory: [],
  };
}

const orders = [makeOrder(1, 'Customer One', 0), makeOrder(2, 'Customer Two', 2)];
const initialOrders: OrdersResponse = {
  items: orders,
  writable: true,
  pagination: {
    page: 1,
    limit: 25,
    totalItems: orders.length,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  },
};

function makeOverview(reportCount = 7): Extract<DailyOrderStatusOverview, { available: true }> {
  const reports = Array.from({ length: reportCount }, (_, index) => {
    const day = new Date('2026-08-18T12:00:00.000Z');
    day.setUTCDate(day.getUTCDate() - index);
    const reportDay = day.toISOString().slice(0, 10);

    return {
      reportDay,
      newOrders: 12 - index,
      confirmationStatusChanges: 9 - index,
      confirmedToday: 6 - index,
      noAnswerOrders: 2,
      adminCancelled: 0,
      carrierCancelled: 1,
      shipmentUpdates: 4,
      profitProjection: {
        basis: 'confirmed' as const,
        reportDay,
        grossProfit: 50_000 - index * 1000,
        adSpend: 10_000,
        estimatedReturnRate: 10,
        estimatedReturnedOrders: 1,
        estimatedReturnLoss: 5_000,
        projectedProfit: 35_000 - index * 1000,
      },
    };
  });

  return {
    available: true,
    reportDay: '2026-08-18',
    timezone: 'Africa/Algiers',
    reports,
    newOrders: 12,
    confirmationStatusChanges: 9,
    confirmedToday: 6,
    noAnswerOrders: 2,
    adminCancelled: 0,
    carrierCancelled: 1,
    shipmentUpdates: 4,
  };
}

function renderWorkspace(
  options: {
    initialOrders?: OrdersResponse;
    initialOverview?: DailyOrderStatusOverview | null;
    completedOrderCount?: number;
    overviewResponse?: Promise<Response>;
    queryClient?: QueryClient;
  } = {},
) {
  server.use(
    ...(options.overviewResponse
      ? [http.get('/api/orders/overview', () => options.overviewResponse!)]
      : []),
    http.get('/api/orders/:id', ({ params }) => {
      const order = orders.find((item) => String(item.id) === String(params.id));
      return order
        ? HttpResponse.json({ ok: true, item: order })
        : HttpResponse.json({ error: 'Not found' }, { status: 404 });
    }),
    http.get('/api/orders/:id/customer', () =>
      HttpResponse.json({ completedOrderCount: options.completedOrderCount ?? 0 }),
    ),
  );
  const queryClient =
    options.queryClient ??
    new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  return render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <OrdersWorkspace
          initialOrders={options.initialOrders ?? initialOrders}
          initialOverview={
            options.initialOverview === null
              ? undefined
              : (options.initialOverview ?? makeOverview())
          }
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe('OrdersWorkspace', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
  });

  it('renders as the integrated orders workspace', () => {
    const { container } = renderWorkspace();

    expect(container.querySelector('[data-admin-workspace="orders"]')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-workspace-frame]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-workspace-header]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-workspace-toolbar]')).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Orders' })).toHaveClass(
      'sr-only',
      'lg:not-sr-only',
    );
    expect(screen.getByText('2 orders')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Phone order' })).toBeInTheDocument();
    expect(screen.getAllByText('Projected profit').length).toBeGreaterThan(0);
    expect(container.querySelector('[data-workspace-header]')?.nextElementSibling).toHaveAttribute(
      'data-orders-pulse',
    );
    expect(screen.queryByText('Seven-day outlook')).not.toBeInTheDocument();
  });

  it('renders the order queue while the overview loads separately', async () => {
    let resolveOverview!: (response: Response) => void;
    const overviewResponse = new Promise<Response>((resolve) => {
      resolveOverview = resolve;
    });

    const { container } = renderWorkspace({ initialOverview: null, overviewResponse });

    expect(screen.getByText('2 orders')).toBeInTheDocument();
    expect(container.querySelector('[data-orders-pulse-loading]')).toHaveAttribute(
      'aria-busy',
      'true',
    );

    resolveOverview(HttpResponse.json({ overview: makeOverview() }));

    await waitFor(() => {
      expect(container.querySelector('[data-orders-pulse]')).toBeInTheDocument();
    });
    expect(container.querySelector('[data-orders-pulse-loading]')).not.toBeInTheDocument();
  });

  it('keeps the complete status filter behind one deliberate phone control', async () => {
    const user = userEvent.setup();
    renderWorkspace();
    const filters = screen.getByRole('button', { name: 'Filters' });

    expect(filters).toHaveAttribute('aria-expanded', 'false');
    await user.click(filters);
    expect(filters).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows submission time and the full workflow status in each queue row', () => {
    const noAnswerOrder = {
      ...makeOrder(2, 'Customer Two', ORDER_STATUS.NO_ANSWER),
      noAnswerCount: 2,
    };
    renderWorkspace({
      initialOrders: {
        ...initialOrders,
        items: [noAnswerOrder],
        pagination: { ...initialOrders.pagination, totalItems: 1 },
      },
    });
    const queue = screen.getByRole('region', { name: 'Order queue' });
    const timestamp = within(queue).getByText(
      formatOrderListTimestamp('en', noAnswerOrder.createdAt),
    );

    expect(timestamp.tagName).toBe('TIME');
    expect(timestamp).toHaveAttribute('dateTime', noAnswerOrder.createdAt);
    expect(within(queue).getByText('No answer 2')).toBeInTheDocument();
  });

  it('filters no-answer work by exact attempt count or the three-plus bucket', async () => {
    const user = userEvent.setup();
    const requestedUrls: string[] = [];
    server.use(
      http.get('/api/orders', ({ request }) => {
        requestedUrls.push(request.url);
        return HttpResponse.json(initialOrders);
      }),
    );
    renderWorkspace();

    await user.click(screen.getByRole('button', { name: /^No answer$/ }));
    await user.click(screen.getByRole('button', { name: /^No answer 2$/ }));

    await waitFor(() =>
      expect(
        requestedUrls.some((url) => {
          const params = new URL(url).searchParams;
          return params.get('inHouseStatus') === '1' && params.get('noAnswerCount') === '2';
        }),
      ).toBe(true),
    );
    expect(screen.getByRole('button', { name: 'Filters · 2' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^At least 3 no-answer attempts$/ }));

    await waitFor(() =>
      expect(
        requestedUrls.some((url) => {
          const params = new URL(url).searchParams;
          return params.get('inHouseStatus') === '1' && params.get('noAnswerCountMin') === '3';
        }),
      ).toBe(true),
    );
  });

  it('presents seven projections as a compact stacked deck', async () => {
    const user = userEvent.setup();
    const { container } = renderWorkspace();
    const outlook = container.querySelector('[data-orders-pulse]');

    expect(outlook).toBeInTheDocument();
    if (!(outlook instanceof HTMLElement)) throw new Error('Orders pulse was not rendered.');
    expect(within(outlook).getAllByRole('article')).toHaveLength(1);
    expect(container.querySelectorAll('[data-projection-stack-layer]')).toHaveLength(2);
    expect(within(outlook).getByText('Tuesday, Aug 18')).toBeInTheDocument();
    expect(within(outlook).getAllByText('Updates').length).toBeGreaterThan(0);
    expect(within(outlook).getAllByText(/9 confirmation · 4 shipment/).length).toBeGreaterThan(0);
    expect(within(outlook).getAllByText('Cancelled').length).toBeGreaterThan(0);
    expect(within(outlook).getAllByText(/0 admin · 1 carrier/).length).toBeGreaterThan(0);
    expect(within(outlook).getByText(/Gross DZD/)).toBeInTheDocument();
    expect(within(outlook).getAllByText('Estimated return loss').length).toBeGreaterThan(0);
    expect(container.querySelector('[data-projection-summary-grid]')?.children).toHaveLength(6);
    const desktopSummary = container.querySelector('[data-projection-summary-grid]');
    expect(desktopSummary).not.toBeNull();
    const orderSummary = within(desktopSummary as HTMLElement).getByText('Orders').parentElement;
    expect(orderSummary).not.toBeNull();
    expect(within(orderSummary!).getByText('12')).toBeInTheDocument();
    expect(within(orderSummary!).getByText('new')).toBeInTheDocument();
    expect(within(orderSummary!).getByText('6')).toBeInTheDocument();
    expect(within(orderSummary!).getByText('confirmed')).toBeInTheDocument();
    expect(within(orderSummary!).getByText('no answer')).toBeInTheDocument();
    const mobileSummary = container.querySelector('[data-mobile-projection-summary]');
    expect(mobileSummary).toBeInTheDocument();
    if (!(mobileSummary instanceof HTMLElement)) {
      throw new Error('Mobile projection summary was not rendered.');
    }
    expect(within(mobileSummary).getByText('Ad spend · Updates')).toBeInTheDocument();
    expect(container.querySelector('[data-mobile-projection-controls] label')).toHaveClass(
      'order-3',
      'w-full',
      'sm:w-auto',
    );
    expect(within(outlook).getByRole('button', { name: 'Next projection day' })).toBeDisabled();
    expect(within(outlook).getByRole('button', { name: 'Today' })).toBeDisabled();

    await user.click(within(outlook).getByRole('button', { name: 'Previous projection day' }));
    expect(within(outlook).getByText('Monday, Aug 17')).toBeInTheDocument();
    expect(within(outlook).getByRole('button', { name: 'Next projection day' })).toBeEnabled();

    await user.click(within(outlook).getByRole('button', { name: 'Today' }));
    expect(within(outlook).getByText('Tuesday, Aug 18')).toBeInTheDocument();

    const previous = within(outlook).getByRole('button', { name: 'Previous projection day' });
    const next = within(outlook).getByRole('button', { name: 'Next projection day' });
    expect(previous.querySelector('.lucide-chevron-right')).toBeInTheDocument();
    expect(next.querySelector('.lucide-chevron-left')).toBeInTheDocument();
    for (let index = 0; index < 6; index += 1) fireEvent.click(previous);
    expect(within(outlook).getByText('Wednesday, Aug 12')).toBeInTheDocument();
    expect(previous).toBeDisabled();
    fireEvent.click(previous);
    expect(within(outlook).getByText('Wednesday, Aug 12')).toBeInTheDocument();
  });

  it('reloads all seven projections when switching between confirmed and posted bases', async () => {
    let requestedUrl = '';
    renderWorkspace();
    server.use(
      http.get('/api/orders/overview', ({ request }) => {
        requestedUrl = request.url;
        const postedOverview = makeOverview();
        postedOverview.reports = postedOverview.reports.map((report) => ({
          ...report,
          profitProjection: report.profitProjection
            ? { ...report.profitProjection, basis: 'posted' as const, projectedProfit: 44_000 }
            : undefined,
        }));
        return HttpResponse.json({ overview: postedOverview });
      }),
    );

    fireEvent.click(screen.getByRole('switch', { name: 'Projection basis' }));
    expect(screen.getByRole('switch', { name: 'Projection basis' })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    await waitFor(() => expect(requestedUrl).toContain('projectionBasis=posted&reportDays=7'), {
      timeout: 1_000,
    });
    expect(screen.getAllByText(/44,000/).length).toBeGreaterThan(0);
  });

  it('keeps shopping-list generation and Ecotrack posting visible as primary operations', () => {
    renderWorkspace();

    expect(screen.getByRole('button', { name: 'Post confirmed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Posted shopping list' })).toBeInTheDocument();
  });

  it('opens phone-order creation as a deliberate full-height mobile workflow', async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(screen.getByRole('button', { name: 'Phone order' }));
    expect(screen.getByRole('dialog', { name: 'Create a phone-assisted order' })).toHaveClass(
      'h-[calc(100dvh-2rem)]',
      'sm:h-auto',
      'sm:max-w-3xl',
    );
  });
});
