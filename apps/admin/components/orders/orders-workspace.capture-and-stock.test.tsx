import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DailyOrderStatusOverview, OrdersResponse } from '../../lib/order-admin-contracts';
import type { OrderRecord } from '../../lib/orders';
import messages from '../../messages/en.json';
import { server } from '../../test/mocks/server';
import { OrderSalesDesk } from './order-sales-desk';
import { OrdersWorkspace } from './orders-workspace';

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

  it.each(['Open created order', 'duplicate'])(
    'closes completed phone capture via %s and resets the next capture',
    async (action) => {
      const user = userEvent.setup();
      const onOpenOrder = vi.fn();
      server.use(
        http.get('/api/orders/product-options', () =>
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

  it('locks phone capture during creation and reuses the accepted attempt after a lost response', async () => {
    const user = userEvent.setup();
    const requests: Array<Record<string, unknown>> = [];
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get('/api/orders/product-options', () =>
        HttpResponse.json({ items: [{ id: 1, title: 'Audit drill', price: 4000, images: [] }] }),
      ),
      http.post('/api/orders', async ({ request }) => {
        requests.push((await request.json()) as Record<string, unknown>);
        if (requests.length === 1) {
          await pending;
          return HttpResponse.error();
        }
        return HttpResponse.json({ ok: true, item: orders[0], duplicateCandidates: [] });
      }),
    );
    const renderDesk = () =>
      render(
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <NextIntlClientProvider locale="en" messages={messages}>
            <OrderSalesDesk
              operatorId="phone-recovery-operator"
              writable
              onOpenOrder={vi.fn()}
              onCreated={async () => undefined}
            />
          </NextIntlClientProvider>
        </QueryClientProvider>,
      );
    let mounted = renderDesk();
    const fillCapture = async () => {
      await user.click(screen.getByRole('button', { name: 'Phone order' }));
      await user.type(screen.getByLabelText('Customer name'), 'Operator test');
      await user.type(screen.getByLabelText('Telephone'), '+213 550 123 456');
      await user.type(screen.getByPlaceholderText('Search title, SKU, or barcode'), 'Audit');
      await user.click(await screen.findByRole('button', { name: /Audit drill/ }));
    };
    await fillCapture();
    await user.click(screen.getByRole('button', { name: 'Create order' }));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(screen.getByLabelText('Telephone')).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Close$/ })).toBeDisabled();
    await user.type(screen.getByLabelText('Telephone'), '999');
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    release();
    await screen.findByText(messages.salesDesk.retryUnconfirmed);
    expect(screen.getByLabelText('Telephone')).toHaveValue('+213 550 123 456');
    expect(screen.getByLabelText('Telephone')).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /^Close$/ }));
    mounted.unmount();
    mounted = renderDesk();
    await user.click(screen.getByRole('button', { name: 'Phone order' }));
    expect(screen.getByLabelText('Telephone')).toHaveValue('+213 550 123 456');
    await user.click(screen.getByRole('button', { name: 'Create order' }));
    await screen.findByRole('button', { name: 'Open created order' });
    expect(requests[1]).toEqual(requests[0]);
    expect(
      window.sessionStorage.getItem('bric:phone-order-attempt:phone-recovery-operator'),
    ).toBeNull();
    expect(requests[0]?.requestId).toEqual(expect.any(String));
    expect(screen.getByLabelText('Telephone')).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /^Close$/ }));
    await fillCapture();
    await user.click(screen.getByRole('button', { name: 'Create order' }));
    await screen.findByRole('button', { name: 'Open created order' });
    expect(requests[2]?.requestId).not.toBe(requests[0]?.requestId);
  });

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
    const detailsRequests: unknown[] = [];
    server.use(
      http.get('/api/products', () => HttpResponse.json({ error: 'Forbidden' }, { status: 403 })),
      http.get('/api/products/99', () =>
        HttpResponse.json({ error: 'Forbidden' }, { status: 403 }),
      ),
      http.get('/api/brands', () => HttpResponse.json({ error: 'Forbidden' }, { status: 403 })),
      http.get('/api/orders/product-options', () =>
        HttpResponse.json({
          items: [
            {
              id: 99,
              title: 'Manual spare',
              slug: 'manual-spare',
              price: '1200',
              images: [],
              brandId: 8,
            },
          ],
        }),
      ),
      http.post('/api/orders/shopping-list-details', async ({ request }) => {
        detailsRequests.push(await request.json());
        return HttpResponse.json({
          products: [{ id: 99, inventoryQuantity: 3, purchasePrice: '800' }],
          brands: [{ id: 8, name: 'Spare brand' }],
        });
      }),
    );
    await user.type(screen.getByPlaceholderText('Search catalog products'), 'Manual spare');
    await user.click(await screen.findByRole('button', { name: 'Add product' }));
    await waitFor(() =>
      expect(detailsRequests).toContainEqual({ productIds: [99], brandIds: [8] }),
    );
    expect(await screen.findByText('Spare brand')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Increase quantity for Manual spare' }),
    ).toBeInTheDocument();
  });

  it('keeps the unfulfilled quantity visible after a partial stock deduction exhausts inventory', async () => {
    const user = userEvent.setup();
    renderWorkspace();
    let draft: Record<string, unknown> = {};
    server.use(
      http.get('/api/orders/shopping-list-draft', () => HttpResponse.json({ draft: null })),
      http.post('/api/orders/shopping-list-details', () =>
        HttpResponse.json({
          products: [{ id: 1, inventoryQuantity: 1, purchasePrice: '2800' }],
          brands: [],
        }),
      ),
      http.put('/api/orders/shopping-list-draft', async ({ request }) => {
        draft = {
          ...((await request.json()) as Record<string, unknown>),
          scopeKey: 'selected:1',
          revision: 1,
        };
        return HttpResponse.json({ draft });
      }),
      http.post('/api/orders/shopping-list-draft/apply', () => {
        const items = (draft.draftItems as Array<Record<string, unknown>>).map((item) => ({
          ...item,
          inventoryQuantity: 0,
          inventoryAppliedQuantity: 1,
          inventoryDecreaseQuantity: 0,
          inventoryShortageQuantity: 1,
          inventoryActionEligible: false,
          checked: true,
        }));
        return HttpResponse.json({
          draft: { ...draft, revision: 2, draftItems: items, generatedItems: items },
          items: [{ productId: 1, previousQuantity: 1, nextQuantity: 0 }],
          skipped: [],
        });
      }),
    );
    await user.click(screen.getByRole('checkbox', { name: 'Select Customer One' }));
    await user.click(screen.getByRole('button', { name: 'Posted shopping list menu' }));
    await user.click(screen.getByRole('menuitem', { name: 'Shopping list' }));
    const list = await screen.findByRole('dialog');
    await user.click(
      within(list).getByRole('button', { name: 'Increase quantity for Cordless drill' }),
    );
    await user.click(screen.getByRole('button', { name: 'Print view menu' }));
    await user.click(screen.getByRole('menuitem', { name: 'Accept all inventory changes' }));
    await waitFor(() =>
      expect(within(list).queryByText('Inventory decrease')).not.toBeInTheDocument(),
    );
    expect(within(list).getByText('Short by 1')).toBeVisible();
    expect(within(list).getByRole('checkbox', { name: 'Toggle Cordless drill' })).toBeChecked();
  });
});
