import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DailyOrderStatusOverview, OrdersResponse } from '../../lib/order-admin-contracts';
import type { OrderRecord } from '../../lib/orders';
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

  it.each(['+213 550 12 34 56', '00213 550 12 34 56', '0550 12 34 56', '550 12 34 56'])(
    'preserves untouched phone %s when saving an unrelated operator edit',
    async (phoneNumber1) => {
      const item = { ...orders[0]!, phoneNumber1 };
      let savedBody: Record<string, unknown> | null = null;
      server.use(
        http.get('/api/orders/1', () => HttpResponse.json({ ok: true, item })),
        http.get('/api/orders', () => HttpResponse.json({ ...initialOrders, items: [item] })),
        http.patch('/api/orders/1', async ({ request }) => {
          savedBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ ok: true, item: { ...item, note: 'Call tomorrow.' } });
        }),
      );
      renderWorkspace({ initialOrders: { ...initialOrders, items: [item] } });
      const notes = await screen.findByLabelText('Notes');
      fireEvent.change(notes, { target: { value: 'Call tomorrow.' } });
      await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
      await waitFor(() => expect(savedBody).toMatchObject({ note: 'Call tomorrow.' }));
      expect(savedBody).not.toHaveProperty('phoneNumber1');
    },
  );

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

  it('preserves a dirty order during background refresh and saves only the edited fields against its original baseline', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderWorkspace({ queryClient: client });
    const name = await screen.findByLabelText('Customer name');
    fireEvent.change(name, { target: { value: 'My draft' } });
    const remote = {
      ...orders[0]!,
      note: 'Changed by another operator',
      updatedAt: '2026-08-18T12:00:00Z',
    };
    let resolveDetail!: (response: Response) => void;
    server.use(
      http.get(
        '/api/orders/1',
        () =>
          new Promise<Response>((resolve) => {
            resolveDetail = resolve;
          }),
      ),
    );
    const refresh = client.invalidateQueries({ queryKey: ['orders-workspace-detail', 1] });
    await waitFor(() => expect(resolveDetail).toBeTypeOf('function'));
    expect(name).toHaveValue('My draft');
    resolveDetail(HttpResponse.json({ ok: true, item: remote }));
    await refresh;
    expect(
      await screen.findByText(messages.adminWorkspace.orders.changedElsewhere),
    ).toBeInTheDocument();
    expect(name).toHaveValue('My draft');
    const saved = {
      ...remote,
      firstName: 'My',
      lastName: 'draft',
      fullName: 'My draft',
      updatedAt: '2026-08-18T13:00:00Z',
    };
    let body: unknown;
    server.use(
      http.patch('/api/orders/1', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ ok: true, item: saved });
      }),
      http.get('/api/orders', () =>
        HttpResponse.json({ ...initialOrders, items: [saved, orders[1]!] }),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(body).toEqual({ firstName: 'My', lastName: 'draft' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled(),
    );
    expect(screen.getByLabelText('Notes')).toHaveValue(remote.note);
    expect(
      screen.queryByText(messages.adminWorkspace.orders.changedElsewhere),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Customer name'), { target: { value: 'Discard this' } });
    client.setQueryData(['orders-workspace-detail', 1], {
      ok: true,
      item: { ...saved, fullName: 'Newest name', updatedAt: '2026-08-18T14:00:00Z' },
    });
    fireEvent.click(
      await screen.findByRole('button', { name: messages.adminWorkspace.orders.loadLatest }),
    );
    expect(screen.getByLabelText('Customer name')).toHaveValue('Newest name');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('locks the complete editor while saving and preserves the draft after a failed response', async () => {
    const user = userEvent.setup();
    let releaseSave: (() => void) | undefined;
    const responseHeld = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    const bodies: Record<string, unknown>[] = [];
    const revised = {
      ...orders[0]!,
      fullName: 'Pending draft',
      phoneNumber1: '555000001',
      firstName: 'Pending',
      lastName: 'draft',
      note: 'Keep this note',
      updatedAt: '2026-08-18T11:00:00.000Z',
    };
    renderWorkspace();
    server.use(
      http.patch('/api/orders/1', async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>);
        if (bodies.length === 1) {
          await responseHeld;
          return HttpResponse.json({ ok: false, error: 'Save failed' }, { status: 500 });
        }
        return HttpResponse.json({ ok: true, item: revised });
      }),
      http.get('/api/orders', () =>
        HttpResponse.json({ ...initialOrders, items: [revised, orders[1]!] }),
      ),
    );
    const name = await screen.findByLabelText('Customer name');
    fireEvent.change(name, { target: { value: 'Pending draft' } });
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Keep this note' } });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(name).toBeDisabled();
    expect(screen.getByLabelText('Notes')).toBeDisabled();
    expect(screen.getByLabelText('Status')).toBeDisabled();
    expect(
      screen.getByPlaceholderText(messages.ordersManager.products.searchPlaceholder),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Increase quantity for Cordless drill' }),
    ).toBeDisabled();
    await user.type(name, ' lost input');
    expect(name).toHaveValue('Pending draft');
    releaseSave!();
    await waitFor(() => expect(name).toBeEnabled());
    expect(name).toHaveValue('Pending draft');
    expect(screen.getByLabelText('Notes')).toHaveValue('Keep this note');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]).toEqual(bodies[0]);
    await waitFor(() => expect(screen.getByLabelText('Customer name')).toBeEnabled());
    expect(screen.getByLabelText('Customer name')).toHaveValue('Pending draft');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });
});
