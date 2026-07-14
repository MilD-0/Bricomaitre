import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OrdersManager } from './orders-manager';
import { server } from '../test/mocks/server';

  const { toastMock, xlsxMock } = vi.hoisted(() => ({
  toastMock: {
    loading: vi.fn(() => 'toast-id'),
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  },
  xlsxMock: {
    aoa_to_sheet: vi.fn(() => ({})),
    book_new: vi.fn(() => ({ Sheets: {}, SheetNames: [] })),
    book_append_sheet: vi.fn(),
    writeFile: vi.fn(),
  },
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    if (!values) {
      return key;
    }

    return `${key}:${Object.values(values).join(',')}`;
  },
}));

vi.mock('../lib/toast', () => ({
  toast: toastMock,
}));

vi.mock('xlsx', () => ({
  utils: {
    aoa_to_sheet: xlsxMock.aoa_to_sheet,
    book_new: xlsxMock.book_new,
    book_append_sheet: xlsxMock.book_append_sheet,
  },
  writeFile: xlsxMock.writeFile,
}));

function renderOrdersManager(props?: Parameters<typeof OrdersManager>[0]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <OrdersManager {...props} />
    </QueryClientProvider>,
  );
}

describe('OrdersManager', () => {
  function paginatedOrdersResponse(items: Array<Record<string, unknown>>, requestUrl: string) {
    const url = new URL(requestUrl);
    const page = Number(url.searchParams.get('page') ?? '1');
    const limit = Number(url.searchParams.get('limit') ?? '25');
    const search = (url.searchParams.get('search') ?? '').toLowerCase();
    const confirmed = url.searchParams.get('confirmed');
    const noAnswerCount = url.searchParams.get('noAnswerCount');
    const filtered = items.filter((item) => {
      if (confirmed !== null && confirmed !== '' && String(item.confirmed) !== confirmed) {
        return false;
      }

      if (confirmed === '1' && noAnswerCount !== null && noAnswerCount !== '' && String(item.noAnswerCount) !== noAnswerCount) {
        return false;
      }

      if (!search) {
        return true;
      }

      return [
        item.fullName,
        item.phoneNumber1,
        item.phoneNumber2,
        item.note,
        item.homeAddress,
        item.state,
        item.city,
        Array.isArray(item.cartProducts) ? item.cartProducts.join(' ') : '',
      ].some((value) => String(value ?? '').toLowerCase().includes(search));
    });
    const start = (page - 1) * limit;

    return {
      writable: true,
      items: filtered.slice(start, start + limit),
      pagination: {
        page,
        limit,
        totalItems: filtered.length,
        totalPages: Math.max(1, Math.ceil(filtered.length / limit)),
        hasNextPage: start + limit < filtered.length,
        hasPreviousPage: page > 1,
      },
    };
  }

  beforeEach(() => {
    window.localStorage.clear();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
    vi.spyOn(window, 'open').mockReturnValue({
      document: {
        open: vi.fn(),
        write: vi.fn(),
        close: vi.fn(),
      },
    } as unknown as Window);
    server.use(
      http.get('/api/ecotrack/catalog', () => HttpResponse.json({
        wilayas: [
          { wilayaId: 16, name: 'Alger' },
          { wilayaId: 31, name: 'Oran' },
        ],
        communes: [
          { communeId: 42, wilayaId: 16, name: 'Bab Ezzouar', postalCode: '1621', hasStopDesk: true },
          { communeId: 77, wilayaId: 31, name: 'Bir El Djir', postalCode: '3101', hasStopDesk: true },
        ],
        serviceFees: [
          { serviceType: 'livraison', wilayaId: 16, homeFee: '200', stopDeskFee: '150' },
          { serviceType: 'livraison', wilayaId: 31, homeFee: '250', stopDeskFee: '180' },
        ],
        weightFees: [],
        lastSync: null,
      })),
      http.get('/api/orders/export', () => HttpResponse.json({ job: null })),
      http.get('/api/orders/ecotrack', () => HttpResponse.json({ job: null })),
      http.get('/api/orders/overview', () => HttpResponse.json({
        overview: {
          available: true,
          reportDay: '2026-05-24',
          timezone: 'Africa/Algiers',
          newOrders: 0,
          confirmationStatusChanges: 0,
          confirmedToday: 0,
          noAnswerOrders: 0,
          adminCancelled: 0,
          carrierCancelled: 0,
          shipmentUpdates: 0,
        },
      })),
      http.get('/api/orders/shopping-list-draft', () => HttpResponse.json({ draft: null })),
      http.put('/api/orders/shopping-list-draft', async ({ request }) => {
        const body = await request.json() as Record<string, unknown>;
        return HttpResponse.json({
          ok: true,
          draft: {
            scopeKey: body.sourceMode === 'selected' ? `selected:${(body.orderIds as number[]).join(',')}` : `status:${body.sourceMode}`,
            ...body,
            updatedAt: '2026-03-01T11:00:00.000Z',
            updatedByName: 'Admin',
          },
        });
      }),
      http.delete('/api/orders/shopping-list-draft', () => HttpResponse.json({ ok: true })),
    );
    toastMock.loading.mockClear();
    toastMock.success.mockClear();
    toastMock.error.mockClear();
    toastMock.dismiss.mockClear();
    xlsxMock.aoa_to_sheet.mockClear();
    xlsxMock.book_new.mockClear();
    xlsxMock.book_append_sheet.mockClear();
    xlsxMock.writeFile.mockClear();
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('renders the passive daily order status overview', async () => {
    server.use(
      http.get('/api/orders', ({ request }) => HttpResponse.json(paginatedOrdersResponse([], request.url))),
    );

    renderOrdersManager({
      initialOverview: {
        available: true,
        reportDay: '2026-05-24',
        timezone: 'Africa/Algiers',
        newOrders: 3,
        confirmationStatusChanges: 7,
        confirmedToday: 2,
        noAnswerOrders: 4,
        adminCancelled: 1,
        carrierCancelled: 1,
        shipmentUpdates: 5,
      },
    });

    expect(await screen.findByRole('region', { name: 'title' })).toBeInTheDocument();
    expect(screen.getByText('metrics.newOrders')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('metrics.adminCancelled')).toBeInTheDocument();
    expect(screen.getByText('metrics.carrierCancelled')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('switches both profit projections from confirmed to posted order transitions', async () => {
    const requestedBases: Array<string | null> = [];
    server.use(
      http.get('/api/orders', ({ request }) => HttpResponse.json(paginatedOrdersResponse([], request.url))),
      http.get('/api/orders/overview', async ({ request }) => {
        const basis = new URL(request.url).searchParams.get('projectionBasis');
        requestedBases.push(basis);
        await delay(50);

        return HttpResponse.json({
          overview: {
            available: true,
            reportDay: '2026-05-24',
            timezone: 'Africa/Algiers',
            newOrders: 0,
            confirmationStatusChanges: 0,
            confirmedToday: 0,
            noAnswerOrders: 0,
            adminCancelled: 0,
            carrierCancelled: 0,
            shipmentUpdates: 0,
            reports: [
              {
                reportDay: '2026-05-24',
                newOrders: 0,
                confirmationStatusChanges: 0,
                confirmedToday: 0,
                noAnswerOrders: 0,
                adminCancelled: 0,
                carrierCancelled: 0,
                shipmentUpdates: 0,
                profitProjection: {
                  basis: 'posted',
                  reportDay: '2026-05-24',
                  grossProfit: 15000,
                  adSpend: 1000,
                  estimatedReturnRate: 10,
                  estimatedReturnedOrders: 1,
                  estimatedReturnLoss: 1500,
                  projectedProfit: 12500,
                  previousMonthStart: '2026-04-01',
                  previousMonthEnd: '2026-04-30',
                  previousMonthOrders: 10,
                  previousMonthNegativeOutcomeOrders: 1,
                },
              },
              {
                reportDay: '2026-05-23',
                newOrders: 0,
                confirmationStatusChanges: 0,
                confirmedToday: 0,
                noAnswerOrders: 0,
                adminCancelled: 0,
                carrierCancelled: 0,
                shipmentUpdates: 0,
                profitProjection: {
                  basis: 'posted',
                  reportDay: '2026-05-23',
                  grossProfit: 8000,
                  adSpend: 500,
                  estimatedReturnRate: 10,
                  estimatedReturnedOrders: 1,
                  estimatedReturnLoss: 800,
                  projectedProfit: 6700,
                  previousMonthStart: '2026-04-01',
                  previousMonthEnd: '2026-04-30',
                  previousMonthOrders: 10,
                  previousMonthNegativeOutcomeOrders: 1,
                },
              },
            ],
          },
        });
      }),
    );

    renderOrdersManager({
      initialOverview: {
        available: true,
        reportDay: '2026-05-24',
        timezone: 'Africa/Algiers',
        newOrders: 0,
        confirmationStatusChanges: 0,
        confirmedToday: 0,
        noAnswerOrders: 0,
        adminCancelled: 0,
        carrierCancelled: 0,
        shipmentUpdates: 0,
        reports: [
          {
            reportDay: '2026-05-24',
            newOrders: 0,
            confirmationStatusChanges: 0,
            confirmedToday: 0,
            noAnswerOrders: 0,
            adminCancelled: 0,
            carrierCancelled: 0,
            shipmentUpdates: 0,
            profitProjection: {
              basis: 'confirmed',
              reportDay: '2026-05-24',
              grossProfit: 10000,
              adSpend: 1000,
              estimatedReturnRate: 10,
              estimatedReturnedOrders: 1,
              estimatedReturnLoss: 1000,
              projectedProfit: 8000,
              previousMonthStart: '2026-04-01',
              previousMonthEnd: '2026-04-30',
              previousMonthOrders: 10,
              previousMonthNegativeOutcomeOrders: 1,
            },
          },
        ],
      },
    });

    const basisSwitch = screen.getByRole('switch', { name: 'projection.basisLabel' });
    expect(basisSwitch).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('projection.confirmedBasis')).toBeInTheDocument();

    await userEvent.click(basisSwitch);

    expect(basisSwitch).toBeDisabled();
    await waitFor(() => expect(screen.getByText('projection.postedBasis')).toBeInTheDocument());
    expect(screen.getByRole('switch', { name: 'projection.basisLabel' })).toHaveAttribute('aria-checked', 'true');
    expect(requestedBases).toEqual(['posted']);
    expect(screen.getAllByText('projection.title')).toHaveLength(2);
    expect(screen.getByText(/12,500/)).toBeInTheDocument();
    expect(screen.getByText(/6,700/)).toBeInTheDocument();
  });

  it('defaults to card view, persists table view, and restores it from local storage', async () => {
    const items = [
      {
        id: 1,
        createdAt: '2026-03-01T10:00:00.000Z',
        updatedAt: '2026-03-01T10:00:00.000Z',
        firstName: 'Ada',
        lastName: 'Lovelace',
        fullName: 'Ada Lovelace',
        phoneNumber1: '0550000001',
        phoneNumber2: null,
        cartProducts: ['1'],
        orderProducts: [],
        delivery: 0,
        state: 16,
        city: 'Bab Ezzouar',
        homeAddress: 'Street 1',
        productSubtotal: 1000,
        deliveryFee: 200,
        totalAmount: 1200,
        note: 'Call first',
        confirmed: 0,
        noAnswerCount: 0,
        confirmedBy: null,
        confirmedByName: null,
        confirmedAt: null,
        hasStatusHistory: false,
        statusHistory: [],
      },
    ];

    server.use(
      http.get('/api/orders', ({ request }) => HttpResponse.json(paginatedOrdersResponse(items, request.url))),
    );

    const firstRender = renderOrdersManager();

    expect(await screen.findByTestId('orders-card-view')).toHaveClass('grid');
    expect(screen.getByTestId('orders-table-view')).toHaveClass('hidden');

    await userEvent.click(screen.getByRole('button', { name: 'ordersManager.view.table' }));

    expect(window.localStorage.getItem('orders-view-mode-v1')).toBe(JSON.stringify('table'));
    expect(screen.getByTestId('orders-card-view')).toHaveClass('hidden');
    expect(screen.getByTestId('orders-table-view')).toHaveClass('block');

    firstRender.unmount();
    renderOrdersManager();

    await screen.findAllByDisplayValue('Ada Lovelace');
    expect(screen.getByTestId('orders-table-view')).toHaveClass('block');
  });

  it('keeps inline order controls available in card view', async () => {
    const items = [
      {
        id: 11,
        createdAt: '2026-03-01T10:00:00.000Z',
        updatedAt: '2026-03-01T10:00:00.000Z',
        firstName: 'Ada',
        lastName: 'Lovelace',
        fullName: 'Ada Lovelace',
        phoneNumber1: '0550000001',
        phoneNumber2: null,
        cartProducts: ['1'],
        orderProducts: [{
          productId: 1,
          rawValue: '1',
          title: 'Chair',
          unitPrice: 1000,
          quantity: 1,
          lineTotal: 1000,
          thumbnailUrl: 'https://cdn.example.com/chair.jpg',
          missing: false,
        }],
        delivery: 0,
        state: 16,
        city: 'Bab Ezzouar',
        homeAddress: 'Street 1',
        productSubtotal: 1000,
        deliveryFee: 200,
        totalAmount: 1200,
        note: 'Call first',
        confirmed: 1,
        noAnswerCount: 1,
        confirmedBy: 'admin@example.com',
        confirmedByName: 'Admin',
        confirmedAt: '2026-03-01T11:00:00.000Z',
        hasStatusHistory: true,
        statusHistory: [],
      },
    ];

    server.use(
      http.get('/api/orders', ({ request }) => HttpResponse.json(paginatedOrdersResponse(items, request.url))),
    );

    renderOrdersManager();

    await screen.findAllByDisplayValue('Ada Lovelace');
    const cardView = screen.getByTestId('orders-card-view');
    expect(within(cardView).getAllByRole('button', { name: 'ordersManager.actions.editProducts' }).length).toBeGreaterThan(0);
    expect(within(cardView).getAllByLabelText('ordersManager.phone.label').length).toBeGreaterThan(0);
    expect(within(cardView).getByRole('combobox', { name: 'ordersManager.columns.status' })).toBeInTheDocument();
    expect(within(cardView).getByRole('combobox', { name: 'ordersManager.address.region' })).toBeInTheDocument();
    expect(within(cardView).getByRole('button', { name: 'ordersManager.notes.save' })).toBeInTheDocument();
  });

  it('renders the orders table and filters by search', async () => {
    const items = [
      {
        id: 1,
        ecotrackTrackingNumber: 'TRK-1',
        createdAt: '2026-03-01T10:00:00.000Z',
        updatedAt: '2026-03-01T10:00:00.000Z',
        firstName: 'Ada',
        lastName: 'Lovelace',
        fullName: 'Ada Lovelace',
        phoneNumber1: '0550000001',
        phoneNumber2: null,
        cartProducts: ['1'],
        orderProducts: [{
          productId: 1,
          rawValue: '1',
          title: 'Chair',
          unitPrice: 1000,
          quantity: 1,
          lineTotal: 1000,
          thumbnailUrl: 'https://cdn.example.com/chair.jpg',
          missing: false,
        }],
        delivery: 0,
        state: 16,
        city: 'Bab Ezzouar',
        homeAddress: 'Street 1',
        productSubtotal: 1000,
        deliveryFee: 200,
        totalAmount: 1200,
        note: 'Call first',
        confirmed: 0,
        noAnswerCount: 0,
        confirmedBy: null,
        confirmedByName: null,
        confirmedAt: null,
        hasStatusHistory: false,
        statusHistory: [],
      },
      {
        id: 2,
        createdAt: '2026-03-02T10:00:00.000Z',
        updatedAt: '2026-03-02T10:00:00.000Z',
        firstName: 'Grace',
        lastName: 'Hopper',
        fullName: 'Grace Hopper',
        phoneNumber1: '0550000002',
        phoneNumber2: null,
        cartProducts: ['2', '2'],
        orderProducts: [{
          productId: 2,
          rawValue: '2',
          title: 'Desk',
          unitPrice: 1000,
          quantity: 2,
          lineTotal: 2000,
          thumbnailUrl: 'https://cdn.example.com/desk.jpg',
          missing: false,
        }],
        delivery: 1,
        state: 31,
        city: 'Bir El Djir',
        homeAddress: 'Street 2',
        productSubtotal: 2000,
        deliveryFee: 150,
        totalAmount: 2150,
        note: null,
        confirmed: 2,
        noAnswerCount: 0,
        confirmedBy: 'admin@example.com',
        confirmedByName: 'Admin',
        confirmedAt: '2026-03-02T12:00:00.000Z',
        hasStatusHistory: true,
        statusHistory: [],
      },
    ];

    server.use(
      http.get('/api/orders', ({ request }) => HttpResponse.json(paginatedOrdersResponse(items, request.url))),
    );

    renderOrdersManager();

    expect((await screen.findAllByDisplayValue('Ada Lovelace')).length).toBeGreaterThan(0);
    expect(screen.getAllByDisplayValue('Grace Hopper').length).toBeGreaterThan(0);
    expect(screen.getAllByText('TRK-1').length).toBeGreaterThan(0);
    expect(screen.getByText('ordersManager.totalOrders:2')).toBeInTheDocument();

    // Mobile card layout must not force horizontal overflow on narrow screens.
    // The phone row should preserve a readable phone width while still wrapping controls.
    const phoneInputs = await screen.findAllByLabelText('ordersManager.phone.label');
    const phoneInput = phoneInputs.find((node) => node.className.includes('w-[9.5rem]'));
    expect(phoneInput).toBeTruthy();
    expect(phoneInput).toHaveClass('h-8');
    expect(phoneInput).toHaveClass('w-[9.5rem]');
    expect(phoneInput).toHaveClass('flex-none');

    await userEvent.type(screen.getByPlaceholderText('ordersManager.searchPlaceholder'), '0550000002');

    await waitFor(() => {
      expect(screen.queryAllByDisplayValue('Ada Lovelace')).toHaveLength(0);
      expect(screen.getAllByDisplayValue('Grace Hopper').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Alger').length).toBeGreaterThan(0);
      expect(screen.getByText('ordersManager.totalOrders:1')).toBeInTheDocument();
    });
  });

  it('clears stale rows while a filtered refetch is pending, even with initial orders', async () => {
    const items = [
      {
        id: 1,
        createdAt: '2026-03-01T10:00:00.000Z',
        updatedAt: '2026-03-01T10:00:00.000Z',
        firstName: 'Ada',
        lastName: 'Lovelace',
        fullName: 'Ada Lovelace',
        phoneNumber1: '0550000001',
        phoneNumber2: null,
        cartProducts: ['1'],
        orderProducts: [],
        delivery: 0,
        state: 16,
        city: 'Bab Ezzouar',
        homeAddress: 'Street 1',
        productSubtotal: 1000,
        deliveryFee: 200,
        totalAmount: 1200,
        note: 'Call first',
        confirmed: 0,
        noAnswerCount: 0,
        confirmedBy: null,
        confirmedByName: null,
        confirmedAt: null,
        hasStatusHistory: false,
        statusHistory: [],
      },
      {
        id: 2,
        createdAt: '2026-03-02T10:00:00.000Z',
        updatedAt: '2026-03-02T10:00:00.000Z',
        firstName: 'Grace',
        lastName: 'Hopper',
        fullName: 'Grace Hopper',
        phoneNumber1: '0550000002',
        phoneNumber2: null,
        cartProducts: ['2'],
        orderProducts: [],
        delivery: 1,
        state: 31,
        city: 'Bir El Djir',
        homeAddress: 'Street 2',
        productSubtotal: 2000,
        deliveryFee: 150,
        totalAmount: 2150,
        note: null,
        confirmed: 2,
        noAnswerCount: 0,
        confirmedBy: 'admin@example.com',
        confirmedByName: 'Admin',
        confirmedAt: '2026-03-02T12:00:00.000Z',
        hasStatusHistory: false,
        statusHistory: [],
      },
    ];
    const initialOrders = paginatedOrdersResponse(items, 'http://localhost/api/orders?page=1&limit=25');

    server.use(
      http.get('/api/orders', async ({ request }) => {
        const url = new URL(request.url);

        if ((url.searchParams.get('confirmed') ?? '').length > 0) {
          await delay(150);
        }

        const confirmed = url.searchParams.get('confirmed');
        const filtered = confirmed == null || confirmed === ''
          ? items
          : items.filter((item) => String(item.confirmed) === confirmed);

        return HttpResponse.json(paginatedOrdersResponse(filtered, request.url));
      }),
    );

    renderOrdersManager({ initialOrders });

    expect((await screen.findAllByDisplayValue('Ada Lovelace')).length).toBeGreaterThan(0);

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'ordersManager.filters.statusLabel' }), '2');

    await waitFor(() => {
      expect(screen.queryAllByDisplayValue('Ada Lovelace')).toHaveLength(0);
    });

    expect(screen.queryAllByDisplayValue('Grace Hopper').length).toBe(0);

    await waitFor(() => {
      expect(screen.getAllByDisplayValue('Grace Hopper').length).toBeGreaterThan(0);
    });
  });

  it('renders wilaya and commune labels when legacy orders store commune names', async () => {
    const items = [
      {
        id: 21,
        createdAt: '2026-03-02T10:00:00.000Z',
        updatedAt: '2026-03-02T10:00:00.000Z',
        firstName: 'Grace',
        lastName: 'Hopper',
        fullName: 'Grace Hopper',
        phoneNumber1: '0550000021',
        phoneNumber2: null,
        cartProducts: ['2'],
        orderProducts: [],
        delivery: 1,
        state: 16,
        city: 'Bab Ezzouar',
        homeAddress: 'Street 21',
        productSubtotal: 2000,
        deliveryFee: 150,
        totalAmount: 2150,
        note: null,
        confirmed: 2,
        noAnswerCount: 0,
        confirmedBy: 'admin@example.com',
        confirmedByName: 'Admin',
        confirmedAt: '2026-03-02T12:00:00.000Z',
        hasStatusHistory: false,
        statusHistory: [],
      },
    ];

    server.use(
      http.get('/api/orders', ({ request }) => HttpResponse.json(paginatedOrdersResponse(items, request.url))),
    );

    renderOrdersManager();

    expect((await screen.findAllByDisplayValue('Grace Hopper')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Alger / Bab Ezzouar').length).toBeGreaterThan(0);
  });

  it('fetches full order history when opening the history dialog', async () => {
    const listItems = [
      {
        id: 2,
        createdAt: '2026-03-02T10:00:00.000Z',
        updatedAt: '2026-03-02T10:00:00.000Z',
        firstName: 'Grace',
        lastName: 'Hopper',
        fullName: 'Grace Hopper',
        phoneNumber1: '0550000002',
        phoneNumber2: null,
        cartProducts: ['2'],
        orderProducts: [],
        delivery: 1,
        state: 31,
        city: 'Bir El Djir',
        homeAddress: 'Street 2',
        productSubtotal: 2000,
        deliveryFee: 150,
        totalAmount: 2150,
        note: null,
        confirmed: 2,
        noAnswerCount: 0,
        confirmedBy: 'admin@example.com',
        confirmedByName: 'Admin',
        confirmedAt: '2026-03-02T12:00:00.000Z',
        hasStatusHistory: true,
        statusHistory: [],
      },
    ];

    server.use(
      http.get('/api/orders', ({ request }) => HttpResponse.json(paginatedOrdersResponse(listItems, request.url))),
      http.get('/api/orders/2', () =>
        HttpResponse.json({
          ok: true,
          item: {
            ...listItems[0],
            statusHistory: [
              {
                id: 90,
                status: 2,
                noAnswerCount: 0,
                changedAt: '2026-03-02T12:00:00.000Z',
                changedBy: 'admin@example.com',
                changedByName: 'Admin',
              },
            ],
          },
        })),
    );

    renderOrdersManager();

    expect(await screen.findAllByDisplayValue('Grace Hopper')).not.toHaveLength(0);
    await userEvent.click(screen.getAllByRole('button', { name: 'ordersManager.history.button' })[0]);

    const dialog = await screen.findByRole('dialog');
    expect((await within(dialog).findAllByText('Admin')).length).toBeGreaterThan(0);
  });

  it('shows a degraded capture badge for incomplete captured orders', async () => {
    const items = [
      {
        id: 91,
        createdAt: '2026-03-01T10:00:00.000Z',
        updatedAt: '2026-03-01T10:00:00.000Z',
        firstName: null,
        lastName: null,
        fullName: '0550000091',
        phoneNumber1: '0550000091',
        phoneNumber2: null,
        cartProducts: ['1'],
        orderProducts: [],
        delivery: 0,
        state: null,
        city: null,
        homeAddress: null,
        productSubtotal: 0,
        deliveryFee: 0,
        totalAmount: 0,
        note: null,
        confirmed: 0,
        noAnswerCount: 0,
        confirmedBy: null,
        confirmedByName: null,
        confirmedAt: null,
        hasStatusHistory: false,
        statusHistory: [],
        variant: 'degraded_capture',
        isDegradedCapture: true,
      },
    ];

    server.use(
      http.get('/api/orders', ({ request }) => HttpResponse.json(paginatedOrdersResponse(items, request.url))),
      http.get('/api/products', () => HttpResponse.json({ items: [] })),
    );

    renderOrdersManager();

    expect(await screen.findAllByText('ordersManager.capture.degraded')).not.toHaveLength(0);
  });

  it('filters the orders table by status', async () => {
    const items = [
      {
        id: 1,
        createdAt: '2026-03-01T10:00:00.000Z',
        updatedAt: '2026-03-01T10:00:00.000Z',
        firstName: 'Ada',
        lastName: 'Lovelace',
        fullName: 'Ada Lovelace',
        phoneNumber1: '0550000001',
        phoneNumber2: null,
        cartProducts: ['1'],
        orderProducts: [{
          productId: 1,
          rawValue: '1',
          title: 'Chair',
          unitPrice: 1000,
          quantity: 1,
          lineTotal: 1000,
          thumbnailUrl: 'https://cdn.example.com/chair.jpg',
          missing: false,
        }],
        delivery: 0,
        state: 16,
        city: 'Bab Ezzouar',
        homeAddress: 'Street 1',
        productSubtotal: 1000,
        deliveryFee: 200,
        totalAmount: 1200,
        note: null,
        confirmed: 0,
        noAnswerCount: 0,
        confirmedBy: null,
        confirmedByName: null,
        confirmedAt: null,
        hasStatusHistory: false,
        statusHistory: [],
      },
      {
        id: 2,
        createdAt: '2026-03-02T10:00:00.000Z',
        updatedAt: '2026-03-02T10:00:00.000Z',
        firstName: 'Grace',
        lastName: 'Hopper',
        fullName: 'Grace Hopper',
        phoneNumber1: '0550000002',
        phoneNumber2: null,
        cartProducts: ['2'],
        orderProducts: [{
          productId: 2,
          rawValue: '2',
          title: 'Desk',
          unitPrice: 1500,
          quantity: 1,
          lineTotal: 1500,
          thumbnailUrl: 'https://cdn.example.com/desk.jpg',
          missing: false,
        }],
        delivery: 1,
        state: 31,
        city: 'Bir El Djir',
        homeAddress: 'Street 2',
        productSubtotal: 1500,
        deliveryFee: 150,
        totalAmount: 1650,
        note: null,
        confirmed: 3,
        noAnswerCount: 0,
        confirmedBy: 'admin@example.com',
        confirmedByName: 'Admin',
        confirmedAt: '2026-03-02T12:00:00.000Z',
        hasStatusHistory: false,
        statusHistory: [],
      },
    ];

    server.use(
      http.get('/api/orders', ({ request }) => {
        const url = new URL(request.url);
        const confirmed = url.searchParams.get('confirmed');
        const filtered = confirmed == null || confirmed === ''
          ? items
          : items.filter((item) => String(item.confirmed) === confirmed);

        return HttpResponse.json(paginatedOrdersResponse(filtered, request.url));
      }),
    );

    renderOrdersManager();

    expect((await screen.findAllByDisplayValue('Ada Lovelace')).length).toBeGreaterThan(0);
    expect(screen.getAllByDisplayValue('Grace Hopper').length).toBeGreaterThan(0);

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'ordersManager.filters.statusLabel' }), '3');

    await waitFor(() => {
      expect(screen.queryAllByDisplayValue('Ada Lovelace')).toHaveLength(0);
    });
    expect(screen.getAllByDisplayValue('Grace Hopper').length).toBeGreaterThan(0);
  });

  it('filters no-answer orders by counter', async () => {
    const items = [
      {
        id: 1,
        createdAt: '2026-03-01T10:00:00.000Z',
        updatedAt: '2026-03-01T10:00:00.000Z',
        firstName: 'Ada',
        lastName: 'Lovelace',
        fullName: 'Ada Lovelace',
        phoneNumber1: '0550000001',
        phoneNumber2: null,
        cartProducts: ['1'],
        orderProducts: [{
          productId: 1,
          rawValue: '1',
          title: 'Chair',
          unitPrice: 1000,
          quantity: 1,
          lineTotal: 1000,
          thumbnailUrl: 'https://cdn.example.com/chair.jpg',
          missing: false,
        }],
        delivery: 0,
        state: 16,
        city: 'Bab Ezzouar',
        homeAddress: 'Street 1',
        productSubtotal: 1000,
        deliveryFee: 200,
        totalAmount: 1200,
        note: null,
        confirmed: 1,
        noAnswerCount: 1,
        confirmedBy: null,
        confirmedByName: null,
        confirmedAt: null,
        hasStatusHistory: false,
        statusHistory: [],
      },
      {
        id: 2,
        createdAt: '2026-03-02T10:00:00.000Z',
        updatedAt: '2026-03-02T10:00:00.000Z',
        firstName: 'Grace',
        lastName: 'Hopper',
        fullName: 'Grace Hopper',
        phoneNumber1: '0550000002',
        phoneNumber2: null,
        cartProducts: ['2'],
        orderProducts: [{
          productId: 2,
          rawValue: '2',
          title: 'Desk',
          unitPrice: 1500,
          quantity: 1,
          lineTotal: 1500,
          thumbnailUrl: 'https://cdn.example.com/desk.jpg',
          missing: false,
        }],
        delivery: 1,
        state: 31,
        city: 'Bir El Djir',
        homeAddress: 'Street 2',
        productSubtotal: 1500,
        deliveryFee: 150,
        totalAmount: 1650,
        note: null,
        confirmed: 1,
        noAnswerCount: 3,
        confirmedBy: null,
        confirmedByName: null,
        confirmedAt: null,
        hasStatusHistory: false,
        statusHistory: [],
      },
    ];

    server.use(
      http.get('/api/orders', ({ request }) => HttpResponse.json(paginatedOrdersResponse(items, request.url))),
    );

    renderOrdersManager();

    expect((await screen.findAllByDisplayValue('Ada Lovelace')).length).toBeGreaterThan(0);
    expect(screen.getAllByDisplayValue('Grace Hopper').length).toBeGreaterThan(0);

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'ordersManager.filters.statusLabel' }), '1');
    const noAnswerSelect = await screen.findByRole('combobox', { name: 'ordersManager.filters.noAnswerCountLabel' });
    await userEvent.selectOptions(noAnswerSelect, '3');

    await waitFor(() => {
      expect(screen.queryAllByDisplayValue('Ada Lovelace')).toHaveLength(0);
    });
    expect(screen.getAllByDisplayValue('Grace Hopper').length).toBeGreaterThan(0);
  });

  it('saves phone updates and deletes orders with toast feedback', async () => {
    const items = [
      {
        id: 1,
        createdAt: '2026-03-01T10:00:00.000Z',
        updatedAt: '2026-03-01T10:00:00.000Z',
        firstName: 'Ada',
        lastName: 'Lovelace',
        fullName: 'Ada Lovelace',
        phoneNumber1: '0550000001',
        phoneNumber2: null,
        cartProducts: ['1'],
        orderProducts: [{
          productId: 1,
          rawValue: '1',
          title: 'Chair',
          unitPrice: 1000,
          quantity: 1,
          lineTotal: 1000,
          thumbnailUrl: 'https://cdn.example.com/chair.jpg',
          missing: false,
        }],
        delivery: 0,
        state: 16,
        city: 'Bab Ezzouar',
        homeAddress: 'Street 1',
        productSubtotal: 1000,
        deliveryFee: 200,
        totalAmount: 1200,
        note: 'Call first',
        confirmed: 1,
        noAnswerCount: 2,
        confirmedBy: null,
        confirmedByName: null,
        confirmedAt: null,
        hasStatusHistory: false,
        statusHistory: [],
      },
    ];

    server.use(
      http.get('/api/orders', ({ request }) => HttpResponse.json(paginatedOrdersResponse(items, request.url))),
      http.patch('/api/orders/1', async ({ request }) => {
        const body = (await request.json()) as { phoneNumber1?: string };
        items[0] = {
          ...items[0],
          phoneNumber1: body.phoneNumber1 ?? items[0].phoneNumber1,
          updatedAt: '2026-03-02T10:00:00.000Z',
        };

        return HttpResponse.json({ ok: true, item: items[0] });
      }),
      http.delete('/api/orders/1', () => {
        items.splice(0, 1);
        return HttpResponse.json({ ok: true });
      }),
    );

    renderOrdersManager();

    expect((await screen.findAllByDisplayValue('Ada Lovelace')).length).toBeGreaterThan(0);

    const phoneInput = screen.getAllByDisplayValue('0550000001')[0]!;
    await userEvent.clear(phoneInput);
    await userEvent.type(phoneInput, '0559999999');
    await userEvent.click(screen.getAllByRole('button', { name: 'ordersManager.phone.save' })[0]!);

    await waitFor(() => {
      expect(screen.getAllByDisplayValue('0559999999')[0]).toBeInTheDocument();
    });
    expect(toastMock.loading).toHaveBeenCalled();
    expect(toastMock.success).toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'ordersManager.actions.deleteOrder' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'actions.delete' }));

    await waitFor(() => {
      expect(screen.queryAllByDisplayValue('Ada Lovelace')).toHaveLength(0);
    });
  });

  it('saves customer name updates inline', async () => {
    const items = [
      {
        id: 1,
        createdAt: '2026-03-01T10:00:00.000Z',
        updatedAt: '2026-03-01T10:00:00.000Z',
        firstName: 'Ada',
        lastName: 'Lovelace',
        fullName: 'Ada Lovelace',
        phoneNumber1: '0550000001',
        phoneNumber2: null,
        cartProducts: ['1'],
        orderProducts: [{
          productId: 1,
          rawValue: '1',
          title: 'Chair',
          unitPrice: 1000,
          quantity: 1,
          lineTotal: 1000,
          thumbnailUrl: 'https://cdn.example.com/chair.jpg',
          missing: false,
        }],
        delivery: 0,
        state: 16,
        city: 'Bab Ezzouar',
        homeAddress: 'Street 1',
        productSubtotal: 1000,
        deliveryFee: 200,
        totalAmount: 1200,
        note: null,
        confirmed: 1,
        noAnswerCount: 0,
        confirmedBy: null,
        confirmedByName: null,
        confirmedAt: null,
        hasStatusHistory: false,
        statusHistory: [],
      },
    ];

    server.use(
      http.get('/api/orders', ({ request }) => HttpResponse.json(paginatedOrdersResponse(items, request.url))),
      http.patch('/api/orders/1', async ({ request }) => {
        const body = (await request.json()) as { firstName?: string | null; lastName?: string | null };
        items[0] = {
          ...items[0],
          firstName: body.firstName ?? items[0].firstName,
          lastName: body.lastName ?? items[0].lastName,
          fullName: [body.firstName ?? items[0].firstName, body.lastName ?? items[0].lastName].filter(Boolean).join(' '),
          updatedAt: '2026-03-02T10:00:00.000Z',
        };

        return HttpResponse.json({ ok: true, item: items[0] });
      }),
    );

    renderOrdersManager();

    const nameInput = (await screen.findAllByLabelText('ordersManager.name.label'))[0]!;
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Ada Byron');
    await userEvent.click(screen.getAllByRole('button', { name: 'ordersManager.name.save' })[0]!);

    await waitFor(() => {
      expect(screen.getAllByDisplayValue('Ada Byron')[0]).toBeInTheDocument();
    });
    expect(toastMock.loading).toHaveBeenCalled();
    expect(toastMock.success).toHaveBeenCalled();
  });

  it('shows a leading zero for stored phone numbers that do not include it', async () => {
    const items = [
      {
        id: 1,
        createdAt: '2026-03-01T10:00:00.000Z',
        updatedAt: '2026-03-01T10:00:00.000Z',
        firstName: 'Ada',
        lastName: 'Lovelace',
        fullName: 'Ada Lovelace',
        phoneNumber1: '550000001',
        phoneNumber2: null,
        cartProducts: ['1'],
        orderProducts: [{
          productId: 1,
          rawValue: '1',
          title: 'Chair',
          unitPrice: 1000,
          quantity: 1,
          lineTotal: 1000,
          thumbnailUrl: 'https://cdn.example.com/chair.jpg',
          missing: false,
        }],
        delivery: 0,
        state: 16,
        city: 'Bab Ezzouar',
        homeAddress: 'Street 1',
        productSubtotal: 1000,
        deliveryFee: 200,
        totalAmount: 1200,
        note: null,
        confirmed: 0,
        noAnswerCount: 0,
        confirmedBy: null,
        confirmedByName: null,
        confirmedAt: null,
        hasStatusHistory: false,
        statusHistory: [],
      },
    ];

    server.use(
      http.get('/api/orders', ({ request }) => HttpResponse.json(paginatedOrdersResponse(items, request.url))),
    );

    renderOrdersManager();

    expect((await screen.findAllByDisplayValue('0550000001')).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'ordersManager.phone.call' }).some((link) => link.getAttribute('href') === 'tel:0550000001')).toBe(true);
  });

  it('edits order products from the popup and recalculates totals', async () => {
    const items = [
      {
        id: 3,
        createdAt: '2026-03-03T10:00:00.000Z',
        updatedAt: '2026-03-03T10:00:00.000Z',
        firstName: 'Margaret',
        lastName: 'Hamilton',
        fullName: 'Margaret Hamilton',
        phoneNumber1: '0550000003',
        phoneNumber2: null,
        cartProducts: ['7'],
        orderProducts: [{
          productId: 7,
          rawValue: '7',
          title: 'Desk',
          unitPrice: 1000,
          quantity: 1,
          lineTotal: 1000,
          thumbnailUrl: 'https://cdn.example.com/desk.jpg',
          missing: false,
        }],
        delivery: 0,
        state: 16,
        city: 'Bab Ezzouar',
        homeAddress: 'Street 3',
        productSubtotal: 1000,
        deliveryFee: 200,
        totalAmount: 1200,
        note: null,
        confirmed: 0,
        noAnswerCount: 0,
        confirmedBy: null,
        confirmedByName: null,
        confirmedAt: null,
        hasStatusHistory: false,
        statusHistory: [],
      },
    ];
    const patchBodies: Array<{ cartProducts?: string[] }> = [];

    server.use(
      http.get('/api/orders', ({ request }) => HttpResponse.json(paginatedOrdersResponse(items, request.url))),
      http.get('/api/products', ({ request }) => {
        const url = new URL(request.url);
        const search = (url.searchParams.get('search') ?? '').toLowerCase();

        if (!search.includes('lamp')) {
          return HttpResponse.json({ items: [], pagination: { page: 1, limit: 8, totalItems: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false } });
        }

        return HttpResponse.json({
          items: [
            {
              id: 9,
              title: 'Lamp',
              price: '500.00',
              images: ['https://cdn.example.com/lamp.jpg'],
              sku: 'LAMP-01',
              barcode: '123456',
            },
          ],
          pagination: { page: 1, limit: 8, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
        });
      }),
      http.patch('/api/orders/3', async ({ request }) => {
        const body = (await request.json()) as { cartProducts?: string[] };
        patchBodies.push(body);
        items[0] = {
          ...items[0],
          cartProducts: body.cartProducts ?? items[0].cartProducts,
          orderProducts: [
            {
              productId: 9,
              rawValue: '9',
              title: 'Lamp',
              unitPrice: 500,
              quantity: 1,
              lineTotal: 500,
              thumbnailUrl: 'https://cdn.example.com/lamp.jpg',
              missing: false,
            },
          ],
          productSubtotal: 500,
          totalAmount: 700,
          updatedAt: '2026-03-04T10:00:00.000Z',
        };

        return HttpResponse.json({ ok: true, item: items[0] });
      }),
    );

    renderOrdersManager();

    expect((await screen.findAllByDisplayValue('Margaret Hamilton')).length).toBeGreaterThan(0);

    await userEvent.click(screen.getAllByRole('button', { name: 'ordersManager.actions.editProducts' })[0]);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Desk')).toBeInTheDocument();
    expect(within(dialog).getByText((content) => content.includes('1,200.00'))).toBeInTheDocument();

    await userEvent.type(within(dialog).getByPlaceholderText('ordersManager.products.searchPlaceholder'), 'lamp');

    expect(await within(dialog).findByText('Lamp')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'ordersManager.products.add' }));

    expect(within(dialog).getAllByText('ordersManager.products.quantity:1')).toHaveLength(2);
    expect(within(dialog).getByText((content) => content.includes('1,700.00'))).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'ordersManager.products.decreaseQuantity:Desk' }));

    await waitFor(() => {
      expect(within(dialog).queryByText('Desk')).not.toBeInTheDocument();
    });
    expect(within(dialog).getByText((content) => content.includes('700.00'))).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'actions.save' }));

    await waitFor(() => {
      expect(patchBodies).toContainEqual({ cartProducts: ['9'] });
    });
    expect(toastMock.success).toHaveBeenCalled();
    expect((await screen.findAllByText(/Lamp/)).length).toBeGreaterThan(0);
  });

  it('shows grouped order products with thumbnail preview on hover', async () => {
    const items = [
      {
        id: 4,
        createdAt: '2026-03-04T10:00:00.000Z',
        updatedAt: '2026-03-04T10:00:00.000Z',
        firstName: 'Katherine',
        lastName: 'Johnson',
        fullName: 'Katherine Johnson',
        phoneNumber1: '0550000004',
        phoneNumber2: null,
        cartProducts: ['7', '7', '9'],
        orderProducts: [
          {
            productId: 7,
            slug: 'standing-desk',
            rawValue: '7',
            title: 'Desk',
            unitPrice: 1500,
            quantity: 2,
            lineTotal: 3000,
            thumbnailUrl: 'https://cdn.example.com/desk.jpg',
            missing: false,
          },
          {
            productId: 9,
            rawValue: '9',
            title: 'Lamp',
            unitPrice: 500,
            quantity: 1,
            lineTotal: 500,
            thumbnailUrl: null,
            missing: false,
          },
        ],
        delivery: 0,
        state: 16,
        city: 'Bab Ezzouar',
        homeAddress: 'Street 9',
        productSubtotal: 3500,
        deliveryFee: 200,
        totalAmount: 3700,
        note: null,
        confirmed: 0,
        noAnswerCount: 0,
        confirmedBy: null,
        confirmedByName: null,
        confirmedAt: null,
        hasStatusHistory: false,
        statusHistory: [],
      },
    ];

    server.use(
      http.get('/api/orders', ({ request }) => HttpResponse.json(paginatedOrdersResponse(items, request.url))),
    );

    renderOrdersManager();

    const [groupedProduct] = await screen.findAllByText(/Desk x2/);
    expect((await screen.findAllByText(/Lamp/)).length).toBeGreaterThan(0);
    const [deskLink] = await screen.findAllByRole('link', { name: /Desk x2/ });
    expect(deskLink).toHaveAttribute('href', 'https://bricomaitre.com/products/standing-desk');
    expect(deskLink).toHaveAttribute('target', '_blank');

    await userEvent.hover(groupedProduct);

    expect((await screen.findAllByAltText('Desk thumbnail')).length).toBeGreaterThan(0);
  });

  it('increments the no-answer counter from the orders UI', async () => {
    const items = [
      {
        id: 5,
        createdAt: '2026-03-05T10:00:00.000Z',
        updatedAt: '2026-03-05T10:00:00.000Z',
        firstName: 'Dorothy',
        lastName: 'Vaughan',
        fullName: 'Dorothy Vaughan',
        phoneNumber1: '0550000005',
        phoneNumber2: null,
        cartProducts: ['10'],
        orderProducts: [{
          productId: 10,
          rawValue: '10',
          title: 'Cabinet',
          unitPrice: 1200,
          quantity: 1,
          lineTotal: 1200,
          thumbnailUrl: null,
          missing: false,
        }],
        delivery: 0,
        state: 16,
        city: 'Bab Ezzouar',
        homeAddress: 'Street 10',
        productSubtotal: 1200,
        deliveryFee: 200,
        totalAmount: 1400,
        note: null,
        confirmed: 1,
        noAnswerCount: 2,
        confirmedBy: null,
        confirmedByName: null,
        confirmedAt: null,
        hasStatusHistory: false,
        statusHistory: [],
      },
    ];

    server.use(
      http.get('/api/orders', ({ request }) => HttpResponse.json(paginatedOrdersResponse(items, request.url))),
      http.patch('/api/orders/5', async ({ request }) => {
        const body = (await request.json()) as { confirmed?: number; noAnswerCount?: number };
        items[0] = {
          ...items[0],
          confirmed: body.confirmed ?? items[0].confirmed,
          noAnswerCount: body.noAnswerCount ?? items[0].noAnswerCount,
          updatedAt: '2026-03-06T10:00:00.000Z',
        };

        return HttpResponse.json({ ok: true, item: items[0] });
      }),
    );

    renderOrdersManager();

    expect((await screen.findAllByDisplayValue('Dorothy Vaughan')).length).toBeGreaterThan(0);

    await userEvent.click(screen.getAllByRole('button', { name: 'ordersManager.status.increaseNoAnswer:3' })[0]);

    await waitFor(() => {
      expect(toastMock.success).toHaveBeenCalled();
    });
  });

  it('updates delivery type immediately from the address selector', async () => {
    const items = [
      {
        id: 6,
        createdAt: '2026-03-06T10:00:00.000Z',
        updatedAt: '2026-03-06T10:00:00.000Z',
        firstName: 'Mary',
        lastName: 'Jackson',
        fullName: 'Mary Jackson',
        phoneNumber1: '0550000006',
        phoneNumber2: null,
        cartProducts: ['12'],
        orderProducts: [{
          productId: 12,
          rawValue: '12',
          title: 'Shelf',
          unitPrice: 900,
          quantity: 1,
          lineTotal: 900,
          thumbnailUrl: null,
          missing: false,
        }],
        delivery: 0,
        state: 16,
        city: 'Bab Ezzouar',
        homeAddress: 'Street 12',
        productSubtotal: 900,
        deliveryFee: 200,
        totalAmount: 1100,
        note: null,
        confirmed: 0,
        noAnswerCount: 0,
        confirmedBy: null,
        confirmedByName: null,
        confirmedAt: null,
        hasStatusHistory: false,
        statusHistory: [],
      },
    ];

    server.use(
      http.get('/api/orders', ({ request }) => HttpResponse.json(paginatedOrdersResponse(items, request.url))),
      http.patch('/api/orders/6', async ({ request }) => {
        const body = (await request.json()) as { delivery?: number };
        items[0] = {
          ...items[0],
          delivery: body.delivery ?? items[0].delivery,
          updatedAt: '2026-03-07T10:00:00.000Z',
        };

        return HttpResponse.json({ ok: true, item: items[0] });
      }),
    );

    renderOrdersManager();

    expect((await screen.findAllByDisplayValue('Mary Jackson')).length).toBeGreaterThan(0);

    const deliverySelects = screen.getAllByLabelText('ordersManager.address.delivery');
    await userEvent.selectOptions(deliverySelects[0], '1');

    await waitFor(() => {
      expect(toastMock.success).toHaveBeenCalled();
    });
  });

  it('hides the street input after switching delivery to office', async () => {
    const items = [
      {
        id: 61,
        createdAt: '2026-03-06T10:00:00.000Z',
        updatedAt: '2026-03-06T10:00:00.000Z',
        firstName: 'Mary',
        lastName: 'Jackson',
        fullName: 'Mary Jackson',
        phoneNumber1: '0550000006',
        phoneNumber2: null,
        cartProducts: ['12'],
        orderProducts: [{
          productId: 12,
          rawValue: '12',
          title: 'Shelf',
          unitPrice: 900,
          quantity: 1,
          lineTotal: 900,
          thumbnailUrl: null,
          missing: false,
        }],
        delivery: 0,
        state: 16,
        city: 'Bab Ezzouar',
        homeAddress: 'Street 12',
        productSubtotal: 900,
        deliveryFee: 200,
        totalAmount: 1100,
        note: null,
        confirmed: 0,
        noAnswerCount: 0,
        confirmedBy: null,
        confirmedByName: null,
        confirmedAt: null,
        hasStatusHistory: false,
        statusHistory: [],
      },
    ];

    server.use(
      http.get('/api/orders', ({ request }) => HttpResponse.json(paginatedOrdersResponse(items, request.url))),
      http.patch('/api/orders/61', async ({ request }) => {
        const body = (await request.json()) as { delivery?: number };
        items[0] = {
          ...items[0],
          delivery: body.delivery ?? items[0].delivery,
          updatedAt: '2026-03-07T10:00:00.000Z',
        };

        return HttpResponse.json({ ok: true, item: items[0] });
      }),
    );

    renderOrdersManager();

    expect((await screen.findAllByDisplayValue('Mary Jackson')).length).toBeGreaterThan(0);
    expect(screen.getAllByPlaceholderText('ordersManager.placeholders.street').length).toBeGreaterThan(0);

    const deliverySelects = screen.getAllByLabelText('ordersManager.address.delivery');
    await userEvent.selectOptions(deliverySelects[0], '1');

    await waitFor(() => {
      expect(toastMock.success).toHaveBeenCalled();
      expect(screen.queryByPlaceholderText('ordersManager.placeholders.street')).not.toBeInTheDocument();
    });
  });

  it('updates the region immediately and switches to the first commune in that wilaya', async () => {
    const items = [
      {
        id: 7,
        createdAt: '2026-03-08T10:00:00.000Z',
        updatedAt: '2026-03-08T10:00:00.000Z',
        firstName: 'Annie',
        lastName: 'Easley',
        fullName: 'Annie Easley',
        phoneNumber1: '0550000007',
        phoneNumber2: null,
        cartProducts: ['13'],
        orderProducts: [{
          productId: 13,
          rawValue: '13',
          title: 'Bench',
          unitPrice: 1000,
          quantity: 1,
          lineTotal: 1000,
          thumbnailUrl: null,
          missing: false,
        }],
        delivery: 0,
        state: 16,
        city: '42',
        homeAddress: 'Street 13',
        productSubtotal: 1000,
        deliveryFee: 200,
        totalAmount: 1200,
        note: null,
        confirmed: 0,
        noAnswerCount: 0,
        confirmedBy: null,
        confirmedByName: null,
        confirmedAt: null,
        hasStatusHistory: false,
        statusHistory: [],
      },
    ];
    const patchBodies: Array<{ state?: string | null; city?: string | null }> = [];

    server.use(
      http.get('/api/orders', ({ request }) => HttpResponse.json(paginatedOrdersResponse(items, request.url))),
      http.patch('/api/orders/7', async ({ request }) => {
        const body = (await request.json()) as { state?: number; city?: string | null; delivery?: number };
        patchBodies.push({
          state: body.state === null || body.state === undefined ? body.state : String(body.state),
          city: body.city ?? null,
        });
        items[0] = {
          ...items[0],
          state: body.state ?? items[0].state,
          city: body.city ?? items[0].city,
          delivery: body.delivery ?? items[0].delivery,
          deliveryFee: body.state === 31 ? 250 : items[0].deliveryFee,
          totalAmount: body.state === 31 ? 1250 : items[0].totalAmount,
          updatedAt: '2026-03-09T10:00:00.000Z',
        };

        return HttpResponse.json({
          ok: true,
          item: {
            ...items[0],
            deliveryFee: items[0].deliveryFee,
            totalAmount: items[0].totalAmount,
          },
        });
      }),
    );

    renderOrdersManager();

    expect((await screen.findAllByDisplayValue('Annie Easley')).length).toBeGreaterThan(0);

    const regionSelects = screen.getAllByLabelText('ordersManager.address.region');
    await userEvent.selectOptions(regionSelects[0], '31');

    await waitFor(() => {
      expect(patchBodies).toContainEqual({ state: '31', city: '77' });
    });
    expect(toastMock.success).toHaveBeenCalled();
    expect(screen.getAllByText(/DZD/).some((node) => node.textContent?.includes('250.00'))).toBe(true);
    expect(screen.getAllByText('Bir El Djir').length).toBeGreaterThan(0);
  });

  it('updates the city immediately from the address selector', async () => {
    const items = [
      {
        id: 8,
        createdAt: '2026-03-10T10:00:00.000Z',
        updatedAt: '2026-03-10T10:00:00.000Z',
        firstName: 'Sally',
        lastName: 'Ride',
        fullName: 'Sally Ride',
        phoneNumber1: '0550000008',
        phoneNumber2: null,
        cartProducts: ['14'],
        orderProducts: [{
          productId: 14,
          rawValue: '14',
          title: 'Mirror',
          unitPrice: 700,
          quantity: 1,
          lineTotal: 700,
          thumbnailUrl: null,
          missing: false,
        }],
        delivery: 0,
        state: 16,
        city: '42',
        homeAddress: 'Street 14',
        productSubtotal: 700,
        deliveryFee: 200,
        totalAmount: 900,
        note: null,
        confirmed: 0,
        noAnswerCount: 0,
        confirmedBy: null,
        confirmedByName: null,
        confirmedAt: null,
        hasStatusHistory: false,
        statusHistory: [],
      },
    ];
    const patchBodies: Array<{ city?: string | null }> = [];

    server.use(
      http.get('/api/orders', ({ request }) => HttpResponse.json(paginatedOrdersResponse(items, request.url))),
      http.get('/api/ecotrack/catalog', () => HttpResponse.json({
        wilayas: [{ wilayaId: 16, name: 'Alger' }],
        communes: [
          { communeId: 42, wilayaId: 16, name: 'Bab Ezzouar', postalCode: '1621', hasStopDesk: true },
          { communeId: 43, wilayaId: 16, name: 'Dar El Beida', postalCode: '1601', hasStopDesk: true },
        ],
        serviceFees: [
          { serviceType: 'livraison', wilayaId: 16, homeFee: '200', stopDeskFee: '150' },
        ],
        weightFees: [],
        lastSync: null,
      })),
      http.patch('/api/orders/8', async ({ request }) => {
        const body = (await request.json()) as { city?: string | null; state?: number };
        patchBodies.push({ city: body.city ?? null });
        items[0] = {
          ...items[0],
          city: body.city ?? items[0].city,
          state: body.state ?? items[0].state,
          updatedAt: '2026-03-11T10:00:00.000Z',
        };

        return HttpResponse.json({ ok: true, item: items[0] });
      }),
    );

    renderOrdersManager();

    expect((await screen.findAllByDisplayValue('Sally Ride')).length).toBeGreaterThan(0);

    const citySelects = screen.getAllByLabelText('ordersManager.address.city');
    await userEvent.selectOptions(citySelects[0], '43');

    await waitFor(() => {
      expect(patchBodies).toContainEqual({ city: '43' });
    });
    expect(toastMock.success).toHaveBeenCalled();
    expect(screen.getAllByText('Dar El Beida').length).toBeGreaterThan(0);
    });
  });

  it('renders bulk order action controls', async () => {
    server.use(
      http.get('/api/orders', ({ request }) => HttpResponse.json(paginatedOrdersResponse([], request.url))),
    );

    renderOrdersManager();

    const statusFilter = await screen.findByRole('combobox', { name: 'ordersManager.filters.statusLabel' });
    const bulkStatus = await screen.findByRole('combobox', { name: 'ordersManager.bulk.statusLabel' });
    const applyButton = screen.getByRole('button', { name: 'ordersManager.bulk.applyStatus' });

    expect(statusFilter).toBeInTheDocument();
    expect(bulkStatus).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ordersManager.bulk.applyStatus' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'ordersManager.ecotrack.confirmedAction' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ordersManager.shoppingList.postedAction' })).toBeInTheDocument();
    expect(statusFilter.closest('div.flex')).toContainElement(applyButton);

    await userEvent.click((await screen.findAllByRole('button', { name: 'ordersManager.ecotrack.confirmedAction menu' }))[0]);
    expect(screen.getByRole('menuitem', { name: 'ordersManager.export.selectedAction' })).toBeDisabled();
    expect(screen.getByRole('menuitem', { name: 'ordersManager.export.confirmedAction' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'ordersManager.ecotrack.selectedAction' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'ordersManager.shoppingList.postedAction menu' }));
    expect(screen.getByRole('menuitem', { name: 'ordersManager.shoppingList.selectedAction' })).toBeDisabled();
    expect(screen.getByRole('menuitem', { name: 'ordersManager.shoppingList.confirmedAction' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'ordersManager.shoppingList.dispatchedAction' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'ordersManager.shoppingList.postedAndConfirmedAction' })).toBeInTheDocument();
  });

  it('opens the confirmed ecotrack preview from the split button primary action', async () => {
    const confirmedItems = [
      {
        id: 21,
        createdAt: '2026-03-01T10:00:00.000Z',
        updatedAt: '2026-03-01T10:00:00.000Z',
        firstName: 'Grace',
        lastName: 'Hopper',
        fullName: 'Grace Hopper',
        phoneNumber1: '550000021',
        phoneNumber2: null,
        cartProducts: ['1'],
        orderProducts: [
          { productId: 1, brandId: 9, rawValue: '1', title: 'Chair', unitPrice: 1000, quantity: 1, lineTotal: 1000, thumbnailUrl: 'https://cdn.example.com/chair.jpg', missing: false },
        ],
        delivery: 0,
        state: 16,
        city: 'Bab Ezzouar',
        homeAddress: 'Street 21',
        productSubtotal: 1000,
        deliveryFee: 200,
        totalAmount: 1200,
        note: null,
        confirmed: 2,
        noAnswerCount: 0,
        confirmedBy: null,
        confirmedByName: null,
        confirmedAt: null,
        hasStatusHistory: false,
        statusHistory: [],
      },
    ];
    const previewBodies: Array<Record<string, unknown>> = [];

    server.use(
      http.get('/api/ecotrack/catalog', () => HttpResponse.json({ wilayas: [], communes: [], serviceFees: [], weightFees: [], lastSync: null })),
      http.get('/api/orders/export', () => HttpResponse.json({ job: null })),
      http.get('/api/orders/ecotrack', () => HttpResponse.json({ job: null })),
      http.get('/api/orders/shopping-list-draft', () => HttpResponse.json({ draft: null })),
      http.delete('/api/orders/shopping-list-draft', () => HttpResponse.json({ ok: true })),
      http.get('/api/orders', ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get('confirmed') === '2') {
          return HttpResponse.json({
            writable: true,
            items: confirmedItems,
            pagination: { page: 1, limit: 100, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
          });
        }

        return HttpResponse.json(paginatedOrdersResponse([], request.url));
      }),
      http.post('/api/orders/ecotrack/preview', async ({ request }) => {
        previewBodies.push(await request.json() as Record<string, unknown>);
        return HttpResponse.json({
          totalRequested: 1,
          eligible: [{
            orderId: 21,
            customerName: 'Grace Hopper',
            destination: 'Alger',
            amount: '1200',
            payload: {
              reference: '21',
              nom_client: 'Grace Hopper',
              telephone: '0550000021',
              adresse: 'Street 21',
              commune: 'Bab Ezzouar',
              code_wilaya: '16',
              montant: '1200',
              type: '1',
              stop_desk: 0,
            },
          }],
          skipped: [],
          invalid: [],
        });
      }),
    );

    renderOrdersManager();

    await userEvent.click((await screen.findAllByRole('button', { name: 'ordersManager.ecotrack.confirmedAction' }))[0]);

    await waitFor(() => {
      expect(previewBodies).toContainEqual({ mode: 'confirmed', orderIds: [21] });
    });
    expect((await screen.findAllByText(/Grace Hopper/)).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'ordersManager.ecotrack.confirm' })).toBeInTheDocument();
  });

  it('builds a confirmed shopping list draft, supports edits, and prints the edited draft', async () => {
    const confirmedItems = [
      {
        id: 31,
        createdAt: '2026-03-01T10:00:00.000Z',
        updatedAt: '2026-03-01T10:00:00.000Z',
        firstName: 'Ada',
        lastName: 'Lovelace',
        fullName: 'Ada Lovelace',
        phoneNumber1: '0550000031',
        phoneNumber2: null,
        cartProducts: ['1'],
        orderProducts: [{ productId: 1, brandId: 9, rawValue: '1', title: 'Chair', unitPrice: 1000, quantity: 1, lineTotal: 1000, thumbnailUrl: 'https://cdn.example.com/chair.jpg', missing: false }],
        delivery: 0,
        state: 16,
        city: 'Bab Ezzouar',
        homeAddress: 'Street 31',
        productSubtotal: 1000,
        deliveryFee: 200,
        totalAmount: 1200,
        note: 'Blue fabric',
        confirmed: 3,
        noAnswerCount: 0,
        confirmedBy: null,
        confirmedByName: null,
        confirmedAt: null,
        hasStatusHistory: false,
        statusHistory: [],
      },
      {
        id: 32,
        createdAt: '2026-03-01T10:00:00.000Z',
        updatedAt: '2026-03-01T10:00:00.000Z',
        firstName: 'Grace',
        lastName: 'Hopper',
        fullName: 'Grace Hopper',
        phoneNumber1: '0550000032',
        phoneNumber2: null,
        cartProducts: ['1', '2'],
        orderProducts: [
          { productId: 1, brandId: 9, rawValue: '1', title: 'Chair', unitPrice: 1000, quantity: 1, lineTotal: 1000, thumbnailUrl: 'https://cdn.example.com/chair.jpg', missing: false },
          { productId: 2, brandId: 10, rawValue: '2', title: 'Desk', unitPrice: 1500, quantity: 1, lineTotal: 1500, thumbnailUrl: 'https://cdn.example.com/desk.jpg', missing: false },
        ],
        delivery: 0,
        state: 16,
        city: 'Bab Ezzouar',
        homeAddress: 'Street 32',
        productSubtotal: 2500,
        deliveryFee: 200,
        totalAmount: 2700,
        note: 'Handle gently',
        confirmed: 3,
        noAnswerCount: 0,
        confirmedBy: null,
        confirmedByName: null,
        confirmedAt: null,
        hasStatusHistory: false,
        statusHistory: [],
      },
    ];
    const confirmedOrdersResponse = {
      writable: true,
      items: confirmedItems,
      pagination: {
        page: 1,
        limit: 100,
        totalItems: confirmedItems.length,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    };
    const emptyOrdersResponse = {
      writable: true,
      items: [],
      pagination: {
        page: 1,
        limit: 25,
        totalItems: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    };

    server.use(
      http.get('/api/ecotrack/catalog', () => HttpResponse.json({ wilayas: [], communes: [], serviceFees: [], weightFees: [], lastSync: null })),
      http.get('/api/orders/export', () => HttpResponse.json({ job: null })),
      http.get('/api/orders/ecotrack', () => HttpResponse.json({ job: null })),
      http.get('/api/orders/shopping-list-draft', () => HttpResponse.json({ draft: null })),
      http.delete('/api/orders/shopping-list-draft', () => HttpResponse.json({ ok: true })),
      http.get('/api/orders', ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get('confirmed') === '2') {
          return HttpResponse.json(confirmedOrdersResponse);
        }

        return HttpResponse.json(emptyOrdersResponse);
      }),
      http.get('/api/products', ({ request }) => {
        const url = new URL(request.url);
        if ((url.searchParams.get('search') ?? '').toLowerCase().includes('lamp')) {
          return HttpResponse.json({
            items: [{
              id: 3,
              title: 'Lamp',
              price: 900,
              images: ['https://cdn.example.com/lamp.jpg'],
            }],
          });
        }

        return HttpResponse.json({ items: [] });
      }),
      http.get('/api/brands/9', () => HttpResponse.json({ id: 9, name: 'Acme' })),
      http.get('/api/brands/10', () => HttpResponse.json({ id: 10, name: 'Globex' })),
      http.get('/api/brands/11', () => HttpResponse.json({ id: 11, name: 'Nova' })),
      http.get('/api/products/1', () => HttpResponse.json({ item: { id: 1, inventoryQuantity: 5 } })),
      http.get('/api/products/2', () => HttpResponse.json({ item: { id: 2, inventoryQuantity: 0 } })),
      http.get('/api/products/3', () => HttpResponse.json({ item: { id: 3, title: 'Lamp', brandId: 11, inventoryQuantity: 7, images: ['https://cdn.example.com/lamp.jpg'] } })),
    );

    renderOrdersManager();

    await userEvent.click((await screen.findAllByRole('button', { name: 'ordersManager.shoppingList.postedAction menu' }))[0]);
    await userEvent.click(screen.getByRole('menuitem', { name: 'ordersManager.shoppingList.confirmedAction' }));

    expect(await screen.findByText('Acme')).toBeInTheDocument();
    expect(screen.getByText('Chair x2')).toBeInTheDocument();
    expect(screen.getAllByText(/Blue fabric/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Handle gently/).length).toBeGreaterThan(0);
    expect(screen.getByText('Chair x2').closest('div.rounded-lg')).toHaveClass('bg-emerald-50');
    expect(screen.getAllByRole('img', { name: 'Chair' }).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Acme / Chair x1').length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole('button', { name: 'ordersManager.shoppingList.increaseQuantity:Chair' }));
    expect(screen.getByText('Chair x3')).toBeInTheDocument();
    expect(screen.getAllByText('Acme / Chair x1').length).toBeGreaterThan(0);

    const searchInput = screen.getByPlaceholderText('ordersManager.shoppingList.addProductPlaceholder');
    await userEvent.type(searchInput, 'Lamp');
    await userEvent.click(await screen.findByRole('button', { name: 'ordersManager.shoppingList.addProductAction' }));
    expect(await screen.findByText('Lamp x1')).toBeInTheDocument();
    expect(screen.getByText('ordersManager.shoppingList.customItem')).toBeInTheDocument();

    const openDocumentSpy = vi.fn();
    const writeDocumentSpy = vi.fn();
    const closeDocumentSpy = vi.fn();
    const printWindowSpy = vi.spyOn(window, 'open').mockReturnValue({
      document: {
        open: openDocumentSpy,
        write: writeDocumentSpy,
        close: closeDocumentSpy,
      },
    } as unknown as Window);
    await userEvent.click(screen.getByRole('button', { name: 'ordersManager.shoppingList.print' }));
    expect(printWindowSpy).toHaveBeenCalled();
    expect(openDocumentSpy).toHaveBeenCalled();
    expect(writeDocumentSpy).toHaveBeenCalledWith(expect.stringContaining('https://cdn.example.com/chair.jpg'));
    expect(writeDocumentSpy).toHaveBeenCalledWith(expect.stringContaining('Lamp'));
    expect(writeDocumentSpy).toHaveBeenCalledWith(expect.stringContaining('Inventory decrease: 3'));
    expect(closeDocumentSpy).toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'ordersManager.shoppingList.reset' }));
    await waitFor(() => {
      expect(screen.getByText('Chair x2')).toBeInTheDocument();
    });
    expect(screen.queryByText('Lamp x1')).not.toBeInTheDocument();
  });

  it('loads shared shopping list drafts, merges new generated items, saves edits, and clears shared reset', async () => {
    const savedDraftItem = {
      draftId: '9:1',
      productId: 1,
      brandId: 9,
      brandName: 'Acme',
      title: 'Chair',
      quantity: 5,
      thumbnailUrl: 'https://cdn.example.com/chair.jpg',
      inventoryQuantity: 5,
      inventoryDecreaseQuantity: 5,
      inventoryShortageQuantity: 0,
      inventoryAppliedQuantity: 0,
      inventoryActionEligible: true,
      notes: ['Saved note'],
      checked: true,
      isCustom: false,
    };
    const customDraftItem = {
      draftId: 'custom:3',
      productId: 3,
      brandId: 11,
      brandName: 'Nova',
      title: 'Lamp',
      quantity: 1,
      thumbnailUrl: 'https://cdn.example.com/lamp.jpg',
      inventoryQuantity: 7,
      inventoryDecreaseQuantity: 1,
      inventoryShortageQuantity: 0,
      inventoryAppliedQuantity: 0,
      inventoryActionEligible: true,
      notes: [],
      checked: false,
      isCustom: true,
    };
    const confirmedItems = [
      {
        id: 31,
        createdAt: '2026-03-01T10:00:00.000Z',
        updatedAt: '2026-03-01T10:00:00.000Z',
        firstName: 'Ada',
        lastName: 'Lovelace',
        fullName: 'Ada Lovelace',
        phoneNumber1: '0550000031',
        phoneNumber2: null,
        cartProducts: ['1', '2'],
        orderProducts: [
          { productId: 1, brandId: 9, rawValue: '1', title: 'Chair', unitPrice: 1000, quantity: 2, lineTotal: 2000, thumbnailUrl: 'https://cdn.example.com/chair.jpg', missing: false },
          { productId: 2, brandId: 10, rawValue: '2', title: 'Desk', unitPrice: 1500, quantity: 1, lineTotal: 1500, thumbnailUrl: 'https://cdn.example.com/desk.jpg', missing: false },
        ],
        delivery: 0,
        state: 16,
        city: 'Bab Ezzouar',
        homeAddress: 'Street 31',
        productSubtotal: 3500,
        deliveryFee: 200,
        totalAmount: 3700,
        note: 'New order note',
        confirmed: 2,
        noAnswerCount: 0,
        confirmedBy: null,
        confirmedByName: null,
        confirmedAt: null,
        hasStatusHistory: false,
        statusHistory: [],
      },
    ];
    const getDraftRequests: string[] = [];
    const ordersRequests: string[] = [];
    const putBodies: Array<Record<string, unknown>> = [];
    const deleteRequests: string[] = [];

    server.use(
      http.get('/api/ecotrack/catalog', () => HttpResponse.json({ wilayas: [], communes: [], serviceFees: [], weightFees: [], lastSync: null })),
      http.get('/api/orders/export', () => HttpResponse.json({ job: null })),
      http.get('/api/orders/ecotrack', () => HttpResponse.json({ job: null })),
      http.get('/api/orders', ({ request }) => {
        const url = new URL(request.url);
        ordersRequests.push(request.url);
        return HttpResponse.json({
          writable: true,
          items: url.searchParams.get('confirmed') === '2' ? confirmedItems : [],
          pagination: { page: 1, limit: 100, totalItems: confirmedItems.length, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
        });
      }),
      http.get('/api/orders/shopping-list-draft', ({ request }) => {
        getDraftRequests.push(request.url);
        return HttpResponse.json({
          draft: {
            scopeKey: 'status:confirmed',
            sourceMode: 'confirmed',
            orderIds: [31],
            title: 'Saved title',
            draftItems: [savedDraftItem, customDraftItem],
            generatedItems: [savedDraftItem],
            orders: [{
              orderId: 31,
              customerName: 'Ada Lovelace',
              note: 'Saved note',
              products: [{
                title: 'Chair',
                quantity: 5,
                brandId: 9,
                brandName: 'Acme',
                thumbnailUrl: 'https://cdn.example.com/chair.jpg',
              }],
            }],
            updatedAt: '2026-03-01T11:00:00.000Z',
            updatedByName: 'Admin',
          },
        });
      }),
      http.put('/api/orders/shopping-list-draft', async ({ request }) => {
        const body = await request.json() as Record<string, unknown>;
        putBodies.push(body);
        return HttpResponse.json({
          ok: true,
          draft: {
            scopeKey: 'status:confirmed',
            ...body,
            updatedAt: '2026-03-01T12:00:00.000Z',
            updatedByName: 'Admin',
          },
        });
      }),
      http.delete('/api/orders/shopping-list-draft', ({ request }) => {
        deleteRequests.push(request.url);
        return HttpResponse.json({ ok: true });
      }),
      http.get('/api/brands/9', () => HttpResponse.json({ id: 9, name: 'Acme' })),
      http.get('/api/brands/10', () => HttpResponse.json({ id: 10, name: 'Globex' })),
      http.get('/api/products/1', () => HttpResponse.json({ item: { id: 1, inventoryQuantity: 5 } })),
      http.get('/api/products/2', () => HttpResponse.json({ item: { id: 2, inventoryQuantity: 0 } })),
    );

    renderOrdersManager();

    await screen.findAllByRole('button', { name: 'ordersManager.shoppingList.postedAction' });
    ordersRequests.length = 0;
    await userEvent.click((await screen.findAllByRole('button', { name: 'ordersManager.shoppingList.postedAction menu' }))[0]);
    await userEvent.click(screen.getByRole('menuitem', { name: 'ordersManager.shoppingList.confirmedAction' }));

    expect(await screen.findByText('Chair x5')).toBeInTheDocument();
    expect(screen.getByText('Lamp x1')).toBeInTheDocument();
    expect(screen.queryByText('Desk x1')).not.toBeInTheDocument();
    expect(ordersRequests).toHaveLength(0);
    expect(getDraftRequests[0]).toContain('sourceMode=confirmed');

    await userEvent.click(screen.getByRole('button', { name: 'ordersManager.shoppingList.refresh' }));

    expect(await screen.findByText('Desk x1')).toBeInTheDocument();
    expect(screen.getAllByText(/^ordersManager\.shoppingList\.generatedAt:/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('ordersManager.shoppingList.generatedAt:ordersManager.shoppingList.previousGeneration').length).toBeGreaterThan(0);
    expect(screen.getByText('Chair x5').closest('div.rounded-lg')).toHaveClass('line-through');

    putBodies.length = 0;
    await userEvent.click(screen.getByRole('checkbox', { name: 'ordersManager.shoppingList.toggleItem:Chair' }));

    await waitFor(() => {
      expect(putBodies.length).toBeGreaterThan(0);
    });
    expect((putBodies.at(-1)?.draftItems as Array<{ draftId: string; checked: boolean }>).find((item) => item.draftId === '9:1')?.checked).toBe(false);
    expect((putBodies.at(-1)?.draftItems as Array<{ draftId: string }>).some((item) => item.draftId === 'custom:3')).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: 'ordersManager.shoppingList.reset' }));
    await waitFor(() => {
      expect(deleteRequests.length).toBe(1);
    });
    expect(await screen.findByText('Chair x2')).toBeInTheDocument();
    expect(screen.getByText('Desk x1')).toBeInTheDocument();
    expect(screen.queryByText('Lamp x1')).not.toBeInTheDocument();
  });

  it('shows confirmed and dispatched empty-state toasts for generated shopping lists and exports', async () => {
    server.use(
      http.get('/api/ecotrack/catalog', () => HttpResponse.json({ wilayas: [], communes: [], serviceFees: [], weightFees: [], lastSync: null })),
      http.get('/api/orders/export', () => HttpResponse.json({ job: null })),
      http.get('/api/orders/ecotrack', () => HttpResponse.json({ job: null })),
      http.get('/api/orders/shopping-list-draft', () => HttpResponse.json({ draft: null })),
      http.get('/api/orders', () => HttpResponse.json({
        writable: true,
        items: [],
        pagination: { page: 1, limit: 100, totalItems: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
      })),
    );

    renderOrdersManager();

    await userEvent.click((await screen.findAllByRole('button', { name: 'ordersManager.shoppingList.postedAction' }))[0]);
    expect(toastMock.error).toHaveBeenCalledWith('ordersManager.shoppingList.emptyPosted', { id: 'toast-id' });

    await userEvent.click((await screen.findAllByRole('button', { name: 'ordersManager.shoppingList.postedAction menu' }))[0]);
    await userEvent.click(screen.getByRole('menuitem', { name: 'ordersManager.shoppingList.dispatchedAction' }));
    expect(toastMock.error).toHaveBeenCalledWith('ordersManager.shoppingList.emptyDispatched', { id: 'toast-id' });

    await userEvent.click((await screen.findAllByRole('button', { name: 'ordersManager.ecotrack.confirmedAction menu' }))[0]);
    await userEvent.click(screen.getByRole('menuitem', { name: 'ordersManager.export.confirmedAction' }));
    expect(toastMock.error).toHaveBeenCalledWith('ordersManager.export.emptyConfirmed', { id: 'toast-id' });
  });

  it('ignores confirmed orders older than a week when preparing the confirmed export', async () => {
    const recentCreatedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const oldCreatedAt = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const confirmedItems = [
      {
        id: 31,
        createdAt: recentCreatedAt,
        updatedAt: recentCreatedAt,
        firstName: 'Recent',
        lastName: 'Order',
        fullName: 'Recent Order',
        phoneNumber1: '0550000031',
        phoneNumber2: null,
        cartProducts: ['1'],
        orderProducts: [
          { productId: 1, brandId: 9, rawValue: '1', title: 'Chair', unitPrice: 1000, quantity: 1, lineTotal: 1000, thumbnailUrl: null, missing: false },
        ],
        delivery: 0,
        state: 16,
        city: 'Bab Ezzouar',
        homeAddress: 'Street 31',
        productSubtotal: 1000,
        deliveryFee: 200,
        totalAmount: 1200,
        note: null,
        confirmed: 2,
        noAnswerCount: 0,
        confirmedBy: null,
        confirmedByName: null,
        confirmedAt: null,
        hasStatusHistory: false,
        statusHistory: [],
      },
      {
        id: 32,
        createdAt: oldCreatedAt,
        updatedAt: oldCreatedAt,
        firstName: 'Old',
        lastName: 'Order',
        fullName: 'Old Order',
        phoneNumber1: '0550000032',
        phoneNumber2: null,
        cartProducts: ['1'],
        orderProducts: [
          { productId: 1, brandId: 9, rawValue: '1', title: 'Chair', unitPrice: 1000, quantity: 1, lineTotal: 1000, thumbnailUrl: null, missing: false },
        ],
        delivery: 0,
        state: 16,
        city: 'Bab Ezzouar',
        homeAddress: 'Street 32',
        productSubtotal: 1000,
        deliveryFee: 200,
        totalAmount: 1200,
        note: null,
        confirmed: 2,
        noAnswerCount: 0,
        confirmedBy: null,
        confirmedByName: null,
        confirmedAt: null,
        hasStatusHistory: false,
        statusHistory: [],
      },
    ];
    const exportBodies: Array<Record<string, unknown>> = [];

    server.use(
      http.get('/api/ecotrack/catalog', () => HttpResponse.json({ wilayas: [], communes: [], serviceFees: [], weightFees: [], lastSync: null })),
      http.get('/api/orders/export', () => HttpResponse.json({ job: null })),
      http.get('/api/orders/ecotrack', () => HttpResponse.json({ job: null })),
      http.get('/api/orders', ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get('confirmed') === '2') {
          return HttpResponse.json({
            writable: true,
            items: confirmedItems,
            pagination: { page: 1, limit: 100, totalItems: confirmedItems.length, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
          });
        }

        return HttpResponse.json(paginatedOrdersResponse([], request.url));
      }),
      http.post('/api/orders/export', async ({ request }) => {
        const body = await request.json();
        exportBodies.push(body as Record<string, unknown>);
        return HttpResponse.json({ job: { id: 'export-1', status: 'queued', fileName: null, progress: { phase: 'loading', current: 0, total: 1, percentage: 0 }, errorMessage: null, downloadPath: null, resultSummary: null } });
      }),
    );

    renderOrdersManager();

    await userEvent.click((await screen.findAllByRole('button', { name: 'ordersManager.ecotrack.confirmedAction menu' }))[0]);
    await userEvent.click(screen.getByRole('menuitem', { name: 'ordersManager.export.confirmedAction' }));
    await userEvent.click(await screen.findByRole('button', { name: 'ordersManager.export.confirmAndDispatch' }));

    await waitFor(() => {
      expect(exportBodies).toContainEqual({ mode: 'confirmed', orderIds: [31] });
    });
  });

  it('shows export start failures inside the export modal instead of a toast', async () => {
    const recentCreatedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const confirmedItems = [
      {
        id: 41,
        createdAt: recentCreatedAt,
        updatedAt: recentCreatedAt,
        firstName: 'Export',
        lastName: 'Failure',
        fullName: 'Export Failure',
        phoneNumber1: '0550000041',
        phoneNumber2: null,
        cartProducts: ['1'],
        orderProducts: [
          { productId: 1, brandId: 9, rawValue: '1', title: 'Chair', unitPrice: 1000, quantity: 1, lineTotal: 1000, thumbnailUrl: null, missing: false },
        ],
        delivery: 0,
        state: 16,
        city: 'Bab Ezzouar',
        homeAddress: 'Street 41',
        productSubtotal: 1000,
        deliveryFee: 200,
        totalAmount: 1200,
        note: null,
        confirmed: 2,
        noAnswerCount: 0,
        confirmedBy: null,
        confirmedByName: null,
        confirmedAt: null,
        hasStatusHistory: false,
        statusHistory: [],
      },
    ];

    server.use(
      http.get('/api/ecotrack/catalog', () => HttpResponse.json({ wilayas: [], communes: [], serviceFees: [], weightFees: [], lastSync: null })),
      http.get('/api/orders/export', () => HttpResponse.json({ job: null })),
      http.get('/api/orders/ecotrack', () => HttpResponse.json({ job: null })),
      http.get('/api/orders', ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get('confirmed') === '2') {
          return HttpResponse.json({
            writable: true,
            items: confirmedItems,
            pagination: { page: 1, limit: 100, totalItems: confirmedItems.length, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
          });
        }

        return HttpResponse.json(paginatedOrdersResponse([], request.url));
      }),
      http.post('/api/orders/export', () => new HttpResponse('Export failed hard', { status: 500 })),
    );

    renderOrdersManager();

    await userEvent.click((await screen.findAllByRole('button', { name: 'ordersManager.ecotrack.confirmedAction menu' }))[0]);
    await userEvent.click(screen.getByRole('menuitem', { name: 'ordersManager.export.confirmedAction' }));
    const toastErrorCallCount = toastMock.error.mock.calls.length;
    await userEvent.click(await screen.findByRole('button', { name: 'ordersManager.export.confirmAndDispatch' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Export failed hard');
    expect(toastMock.error).toHaveBeenCalledTimes(toastErrorCallCount);
    expect(toastMock.dismiss).toHaveBeenCalledWith('toast-id');
  });
