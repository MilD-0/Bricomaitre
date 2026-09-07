import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DailyOrderStatusOverview, OrdersResponse } from '../../lib/order-admin-contracts';
import type { OrderRecord } from '../../lib/orders';
import { toast } from '../../lib/toast';
import messages from '../../messages/en.json';
import { server } from '../../test/mocks/server';
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

  it.each([false, true])(
    'replays an accepted stock request after response loss, with subsequent edits=%s',
    async (editAfterLoss) => {
      const user = userEvent.setup();
      renderWorkspace();
      const errorToast = vi.spyOn(toast, 'error');
      const successToast = vi.spyOn(toast, 'success');
      const applies: Array<Record<string, unknown>> = [];
      let saves = 0;
      let successfulSaves = 0;
      let releaseLostResponse!: () => void;
      const lostResponse = new Promise<void>((resolve) => {
        releaseLostResponse = resolve;
      });
      let draft: Record<string, unknown> = {};
      server.use(
        http.get('/api/orders/shopping-list-draft', () => HttpResponse.json({ draft: null })),
        http.post('/api/orders/shopping-list-details', () =>
          HttpResponse.json({
            products: [{ id: 1, inventoryQuantity: 4, purchasePrice: '2800' }],
            brands: [],
          }),
        ),
        http.put('/api/orders/shopping-list-draft', async ({ request }) => {
          saves += 1;
          if (saves > 1 && applies.length < 2)
            return HttpResponse.json({ error: 'stale revision' }, { status: 409 });
          successfulSaves += 1;
          draft = {
            ...((await request.json()) as Record<string, unknown>),
            scopeKey: 'selected:1',
            revision: applies.length >= 2 ? 3 : 1,
          };
          return HttpResponse.json({ draft });
        }),
        http.post('/api/orders/shopping-list-draft/apply', async ({ request }) => {
          applies.push((await request.json()) as Record<string, unknown>);
          const items = (draft.draftItems as Array<Record<string, unknown>>).map((item) => ({
            ...item,
            inventoryAppliedQuantity: 1,
            inventoryOrderAppliedQuantity: 1,
            inventoryDecreaseQuantity: 0,
            inventoryQuantity: 3,
            checked: true,
          }));
          draft = { ...draft, revision: 2, generatedItems: items, draftItems: items };
          if (applies.length === 1) {
            await lostResponse;
            return HttpResponse.error();
          }
          return HttpResponse.json({
            draft,
            items: [{ productId: 1, previousQuantity: 4, nextQuantity: 3 }],
            skipped: [],
          });
        }),
      );
      await user.click(screen.getByRole('checkbox', { name: 'Select Customer One' }));
      await user.click(screen.getByRole('button', { name: 'Posted shopping list menu' }));
      await user.click(screen.getByRole('menuitem', { name: 'Shopping list' }));
      await screen.findByRole('dialog');
      await user.click(screen.getByRole('button', { name: 'Print view menu' }));
      await user.click(screen.getByRole('menuitem', { name: 'Accept all inventory changes' }));
      await waitFor(() => expect(applies).toHaveLength(1));
      expect(
        within(screen.getByRole('dialog')).getByRole('button', {
          name: 'Increase quantity for Cordless drill',
        }),
      ).toBeDisabled();
      releaseLostResponse();
      await waitFor(() =>
        expect(errorToast).toHaveBeenCalledWith(
          'Failed to apply inventory changes for 1 products.',
          expect.any(Object),
        ),
      );
      if (editAfterLoss)
        await user.click(
          within(screen.getByRole('dialog')).getByRole('button', {
            name: 'Increase quantity for Cordless drill',
          }),
        );
      await user.click(screen.getByRole('button', { name: 'Print view menu' }));
      await user.click(screen.getByRole('menuitem', { name: 'Accept all inventory changes' }));
      await waitFor(() =>
        expect(successToast).toHaveBeenCalledWith(
          'Applied inventory changes for 1 products.',
          expect.any(Object),
        ),
      );
      expect(successfulSaves).toBe(editAfterLoss ? 2 : 1);
      expect((draft.draftItems as Array<Record<string, unknown>>)[0]).toMatchObject({
        quantity: editAfterLoss ? 2 : 1,
        inventoryAppliedQuantity: 1,
      });
      expect(draft.revision).toBe(editAfterLoss ? 3 : 2);
      expect(applies).toHaveLength(2);
      expect(applies[1]).toEqual(applies[0]);
      expect(applies[0]).toMatchObject({ revision: 1, requestId: expect.any(String) });
      if (!editAfterLoss)
        expect(
          within(screen.getByRole('dialog')).queryByText('Inventory decrease'),
        ).not.toBeInTheDocument();
    },
  );

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

    expect(
      within(screen.getByRole('region', { name: 'Order queue' })).getByText(
        'Call before delivery.',
      ),
    ).toBeInTheDocument();
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
});
