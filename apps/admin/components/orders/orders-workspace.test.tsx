import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

import messages from '../../messages/en.json';
import type { DailyOrderStatusOverview, OrdersResponse } from '../../lib/order-admin-contracts';
import type { OrderRecord } from '../../lib/orders';
import { ORDER_STATUS } from '../../lib/orders';
import { server } from '../../test/mocks/server';
import { OrdersWorkspace } from './orders-workspace';
import { OrderSalesDesk } from './order-sales-desk';
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
  const queryClient = new QueryClient({
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

  it.each(['Open created order', 'duplicate'])(
    'closes completed phone capture via %s and resets the next capture',
    async (action) => {
      const user = userEvent.setup();
      const onOpenOrder = vi.fn();
      server.use(
        http.get('/api/products', () =>
          HttpResponse.json({ items: [{ id: 1, title: 'Audit drill', price: 4000, images: [] }] }),
        ),
        http.post('/api/orders', () =>
          HttpResponse.json({
            ok: true,
            item: orders[0],
            duplicateCandidates: [{ id: 2, createdAt: '2026-08-18T10:00:00Z' }],
          }),
        ),
      );
      render(
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <NextIntlClientProvider locale="en" messages={messages}>
            <OrderSalesDesk writable onOpenOrder={onOpenOrder} onCreated={async () => undefined} />
          </NextIntlClientProvider>
        </QueryClientProvider>,
      );
      await user.click(screen.getByRole('button', { name: 'Phone order' }));
      await user.type(screen.getByLabelText('Customer name'), 'Operator test');
      await user.type(screen.getByLabelText('Telephone'), '0661920626');
      await user.type(screen.getByPlaceholderText('Search title, SKU, or barcode'), 'Audit');
      await user.click(await screen.findByRole('button', { name: /Audit drill/ }));
      await user.click(screen.getByRole('button', { name: 'Create order' }));
      await screen.findByRole('button', { name: 'Open created order' });
      await user.click(
        action === 'duplicate'
          ? screen.getByRole('button', { name: /^#2/ })
          : screen.getByRole('button', { name: action }),
      );
      expect(onOpenOrder).toHaveBeenCalledWith(action === 'duplicate' ? 2 : 1);
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: 'Phone order' }));
      expect(screen.getByLabelText('Customer name')).toHaveValue('');
      expect(screen.getByLabelText('Telephone')).toHaveValue('');
      expect(screen.getByRole('button', { name: 'Create order' })).toBeDisabled();
    },
  );

  it('generates the established shopping-list workflow from selected orders', async () => {
    const user = userEvent.setup();
    renderWorkspace();
    server.use(
      http.get('/api/orders/shopping-list-draft', () => HttpResponse.json({ draft: null })),
      http.put('/api/orders/shopping-list-draft', async ({ request }) => {
        const payload = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ draft: { ...payload, scopeKey: 'selected:1', revision: 1 } });
      }),
      http.get('/api/orders/shopping-list-draft/review', () => HttpResponse.json({ reviews: [] })),
      http.post('/api/orders/shopping-list-details', () =>
        HttpResponse.json({
          products: [{ id: 1, inventoryQuantity: 4, purchasePrice: '2800' }],
          brands: [],
        }),
      ),
    );

    await user.click(screen.getByRole('checkbox', { name: 'Select Customer One' }));
    await user.click(screen.getByRole('button', { name: 'Posted shopping list menu' }));
    await user.click(screen.getByRole('menuitem', { name: 'Shopping list' }));

    const shoppingListDialog = await screen.findByRole('dialog');
    expect(shoppingListDialog).toHaveTextContent('Shopping list for 1 selected orders');
    expect(shoppingListDialog).toHaveClass('h-[calc(100dvh-2rem)]', 'sm:h-auto', 'sm:max-w-6xl');
    expect(screen.getAllByText(/Cordless drill/).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Print view menu' }));
    expect(screen.getByRole('menuitem', { name: 'Refresh list' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Reset list' })).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Apply selected inventory changes' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Accept all inventory changes' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Review previous stock deductions' }));
    await screen.findByRole('dialog', { name: 'Review previous stock deductions' });
    await waitFor(() => expect(screen.getAllByRole('dialog')).toHaveLength(1));
    await user.keyboard('{Escape}');
    await screen.findByRole('dialog', { name: 'Shopping list for 1 selected orders' });
    await waitFor(() => expect(screen.getAllByRole('dialog')).toHaveLength(1));
  });

  it('previews and starts selected-order Ecotrack posting through production contracts', async () => {
    const user = userEvent.setup();
    let previewBody: Record<string, unknown> | null = null;
    let postingBody: Record<string, unknown> | null = null;
    renderWorkspace();
    server.use(
      http.post('/api/orders/ecotrack/preview', async ({ request }) => {
        previewBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          totalRequested: 1,
          eligible: [
            {
              orderId: 1,
              customerName: 'Customer One',
              destination: 'Algiers',
              amount: '4500',
              payload: {
                reference: '1',
                nom_client: 'Customer One',
                telephone: '0555000001',
                adresse: '1 Workshop street',
                commune: 'Algiers',
                code_wilaya: '16',
                montant: '4500',
                type: '1',
                stop_desk: 0,
              },
            },
          ],
          skipped: [],
          invalid: [],
        });
      }),
      http.post('/api/orders/ecotrack', async ({ request }) => {
        postingBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          job: {
            id: 'job-1',
            status: 'queued',
            progress: { phase: 'loading', current: 0, total: 1, percentage: 0 },
            errorMessage: null,
            resultSummary: { results: {} },
          },
        });
      }),
      http.get('/api/orders/ecotrack', () =>
        HttpResponse.json({
          job: {
            id: 'job-1',
            status: 'running',
            progress: { phase: 'creating', current: 0, total: 1, percentage: 0 },
            errorMessage: null,
            resultSummary: { results: {} },
          },
        }),
      ),
    );

    await user.click(screen.getByRole('checkbox', { name: 'Select Customer One' }));
    await user.click(screen.getByRole('button', { name: 'Post confirmed menu' }));
    await user.click(screen.getByRole('menuitem', { name: 'Post selected to Delivro' }));

    expect(await screen.findByRole('dialog')).toHaveTextContent(
      'Post 1 selected orders to Delivro',
    );
    expect(previewBody).toEqual({ mode: 'selected', orderIds: [1] });
    await user.click(screen.getByRole('button', { name: 'Post to Ecotrack' }));
    await waitFor(() => expect(postingBody).toEqual({ mode: 'selected', orderIds: [1] }));
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('Posting results'));
  });

  it('shows note evidence and links directly to public tracking from each order row', () => {
    renderWorkspace();

    expect(screen.getByText('Call before delivery.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open tracking for Customer One' })).toHaveAttribute(
      'href',
      'https://bricomaitre.com/fr/thank-you?token=token-1',
    );
  });

  it('creates a missing tracking token before copying the row action link', async () => {
    const user = userEvent.setup();
    let tokenRequested = false;
    const withoutToken: OrdersResponse = {
      ...initialOrders,
      items: [{ ...orders[0]!, publicToken: null }, orders[1]!],
    };
    server.use(
      http.post('/api/orders/1', () => {
        tokenRequested = true;
        return HttpResponse.json({ ok: true, publicToken: 'generated-token' });
      }),
    );

    renderWorkspace({ initialOrders: withoutToken });
    await user.click(screen.getByRole('button', { name: 'Actions · Customer One' }));
    await user.click(screen.getByRole('menuitem', { name: 'Copy tracking link' }));

    await waitFor(() => expect(tokenRequested).toBe(true));
    await expect(navigator.clipboard.readText()).resolves.toBe(
      'https://bricomaitre.com/fr/thank-you?token=generated-token',
    );
  });

  it('offers direct numbered pagination and requests the selected page', async () => {
    const user = userEvent.setup();
    let requestedPage: string | null = null;
    const paginated = {
      ...initialOrders,
      pagination: {
        ...initialOrders.pagination,
        totalItems: 500,
        totalPages: 20,
        hasNextPage: true,
      },
    };
    server.use(
      http.get('/api/orders', ({ request }) => {
        requestedPage = new URL(request.url).searchParams.get('page');
        return HttpResponse.json({
          ...paginated,
          pagination: {
            ...paginated.pagination,
            page: Number(requestedPage),
            hasNextPage: requestedPage !== '20',
            hasPreviousPage: requestedPage !== '1',
          },
        });
      }),
    );

    renderWorkspace({ initialOrders: paginated });
    await user.click(screen.getByRole('button', { name: 'Go to page 20' }));

    await waitFor(() => expect(requestedPage).toBe('20'));
    expect(screen.getByText('Page 20 of 20')).toBeInTheDocument();
  });

  it('applies one selected bulk status through the real order mutation contract', async () => {
    const user = userEvent.setup();
    let savedBody: Record<string, unknown> | null = null;
    server.use(
      http.patch('/api/orders/1', async ({ request }) => {
        savedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ok: true, item: { ...orders[0], inHouseStatus: 1 } });
      }),
      http.get('/api/orders', () => HttpResponse.json(initialOrders)),
    );

    renderWorkspace();
    await user.click(screen.getByRole('checkbox', { name: 'Select Customer One' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Bulk status' }), '1');
    await user.click(screen.getByRole('button', { name: 'Apply status' }));

    await waitFor(() => expect(savedBody).toEqual({ inHouseStatus: 1, noAnswerCount: 1 }));
    await waitFor(() => expect(screen.queryByText('1 selected')).not.toBeInTheDocument());
  });

  it('keeps row actions compact, dismisses them conventionally, and confirms deletion', async () => {
    const user = userEvent.setup();
    let deleted = false;
    server.use(
      http.delete('/api/orders/1', () => {
        deleted = true;
        return HttpResponse.json({ ok: true });
      }),
      http.get('/api/orders', () => HttpResponse.json(initialOrders)),
    );

    renderWorkspace();
    const actions = screen.getByRole('button', { name: 'Actions · Customer One' });
    await user.click(actions);
    expect(screen.getByRole('menuitem', { name: 'Copy tracking link' })).toBeInTheDocument();

    await user.click(screen.getByText('Tuesday, Aug 18'));
    expect(screen.queryByRole('menuitem', { name: 'Copy tracking link' })).not.toBeInTheDocument();

    await user.click(actions);
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(deleted).toBe(true));
  });

  it('shows a discreet completed-order count for returning telephone customers', async () => {
    renderWorkspace({ completedOrderCount: 3 });

    expect(await screen.findByText('Returning customer · 3 completed orders')).toBeInTheDocument();
  });

  it('links current order products to the same Storefront pages as the product table', async () => {
    renderWorkspace();

    const link = await screen.findByRole('link', { name: 'Cordless drill' });
    expect(link).toHaveAttribute('href', 'https://bricomaitre.com/products/cordless-drill');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('saves customer, fulfillment, status, products, and notes from the focused editor', async () => {
    const user = userEvent.setup();
    let savedBody: Record<string, unknown> | null = null;
    const revised = {
      ...orders[0]!,
      firstName: 'A',
      lastName: 'B',
      fullName: 'A B',
      note: 'Door.',
      inHouseStatus: 2 as const,
      noAnswerCount: 0,
      cartProducts: ['1', '1'],
      orderProducts: [{ ...orders[0]!.orderProducts[0]!, quantity: 2, lineTotal: 8000 }],
      productSubtotal: 8000,
      totalAmount: 8500,
    };
    server.use(
      http.get('/api/orders/1', () => HttpResponse.json({ ok: true, item: orders[0] })),
      http.patch('/api/orders/1', async ({ request }) => {
        savedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ok: true, item: revised });
      }),
      http.get('/api/orders', () => HttpResponse.json(initialOrders)),
    );

    renderWorkspace();
    const name = await screen.findByLabelText('Customer name');
    fireEvent.change(name, { target: { value: 'A B' } });
    await user.selectOptions(screen.getByLabelText('Status'), '2');
    await user.click(screen.getByRole('button', { name: 'Increase quantity for Cordless drill' }));
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Door.' } });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(savedBody).toMatchObject({
        firstName: 'A',
        lastName: 'B',
        inHouseStatus: 2,
        cartProducts: ['1', '1'],
        note: 'Door.',
      }),
    );
  });

  it('keeps the selected order in the page workspace without opening a second overlay', async () => {
    const user = userEvent.setup();
    const { container } = renderWorkspace();
    const workspace = container.querySelector('[data-admin-workspace="orders"]');

    expect(workspace).toBeInTheDocument();
    expect(workspace?.className).not.toMatch(/rounded|shadow|glass-surface/);
    expect(screen.queryByText('Adjust quantities or remove products before saving.')).toBeNull();

    await user.click(screen.getByRole('button', { name: /Customer Two#2/i }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await screen.findByDisplayValue('Customer Two')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Order queue' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Order queue' }));
    expect(screen.getByRole('button', { name: /Customer One#1/i })).toBeInTheDocument();
  });

  it('restores the queue scroll position after closing an order on a narrow layout', async () => {
    const user = userEvent.setup();
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 720 });
    renderWorkspace();

    await user.click(screen.getByRole('button', { name: /Customer Two#2/i }));
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
    await user.click(screen.getByRole('button', { name: 'Order queue' }));

    expect(scrollTo).toHaveBeenCalledWith({ top: 720, left: 0, behavior: 'auto' });
  });
});
