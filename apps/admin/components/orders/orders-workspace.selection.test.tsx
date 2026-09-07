import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DailyOrderStatusOverview, OrdersResponse } from '../../lib/order-admin-contracts';
import type { OrderRecord } from '../../lib/orders';
import messages from '../../messages/en.json';
import { server } from '../../test/mocks/server';
import { OrderEditor } from './order-editor';
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

it('keeps accepted order totals for unrelated edits and previews commercial edits explicitly', async () => {
  const order = {
    ...makeOrder(1, 'Customer One', 0),
    subtotalOverride: 3000,
    productSubtotal: 4000,
    deliveryFee: 500,
    totalAmount: 3500,
  };
  server.use(
    http.get('/api/orders/1/customer', () => HttpResponse.json({ available: false })),
    http.get('/api/orders/1', () => HttpResponse.json({ ok: true, item: order })),
  );
  const onSave = vi.fn(async () => null);
  const catalog = {
    wilayas: [{ wilayaId: 16, name: 'Algiers' }],
    communes: [],
    weightFees: [],
    lastSync: null,
    serviceFees: [{ serviceType: 'livraison', wilayaId: 16, homeFee: '700', stopDeskFee: '400' }],
  };
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <NextIntlClientProvider locale="en" messages={messages}>
        <OrderEditor order={order} catalog={catalog} writable pending={false} onSave={onSave} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  expect(screen.getByText(/DZD\s3,500/)).toBeVisible();
  expect(screen.queryByText(/DZD\s4,700/)).not.toBeInTheDocument();
  await userEvent.type(screen.getByRole('textbox', { name: 'Notes' }), ' extra');
  await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() =>
    expect(onSave).toHaveBeenCalledWith(order, { note: 'Call before delivery. extra' }),
  );
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Delivery type' }), '1');
  expect(screen.getByText(/DZD\s3,400/)).toBeVisible();
});
