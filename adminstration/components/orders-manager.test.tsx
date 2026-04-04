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

function renderOrdersManager() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <OrdersManager />
    </QueryClientProvider>,
  );
}

describe('OrdersManager', () => {
  function paginatedOrdersResponse(items: Array<Record<string, unknown>>, requestUrl: string) {
    const url = new URL(requestUrl);
    const page = Number(url.searchParams.get('page') ?? '1');
    const limit = Number(url.searchParams.get('limit') ?? '25');
    const search = (url.searchParams.get('search') ?? '').toLowerCase();
    const filtered = items.filter((item) => {
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
    );
    toastMock.loading.mockClear();
    toastMock.success.mockClear();
    toastMock.error.mockClear();
    xlsxMock.aoa_to_sheet.mockClear();
    xlsxMock.book_new.mockClear();
    xlsxMock.book_append_sheet.mockClear();
    xlsxMock.writeFile.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the orders table and filters by search', async () => {
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

    expect((await screen.findAllByText('Ada Lovelace')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Grace Hopper').length).toBeGreaterThan(0);

    // Mobile card layout must not force horizontal overflow on narrow screens.
    // The phone row should preserve a readable phone width while still wrapping controls.
    const phoneInputs = await screen.findAllByLabelText('ordersManager.phone.label');
    const phoneInput = phoneInputs.find((node) => node.className.includes('basis-48'));
    expect(phoneInput).toBeTruthy();
    expect(phoneInput).toHaveClass('min-w-[13rem]');
    expect(phoneInput).toHaveClass('flex-1');
    expect(phoneInput).toHaveClass('basis-48');

    await userEvent.type(screen.getByPlaceholderText('ordersManager.searchPlaceholder'), '0550000002');

    expect(screen.queryAllByText('Ada Lovelace')).toHaveLength(0);
    expect(screen.getAllByText('Grace Hopper').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Alger').length).toBeGreaterThan(0);
  });

  it('keeps previous rows visible while a filtered refetch is pending', async () => {
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

    server.use(
      http.get('/api/orders', async ({ request }) => {
        const url = new URL(request.url);

        if ((url.searchParams.get('search') ?? '').length > 0) {
          await delay(150);
        }

        return HttpResponse.json(paginatedOrdersResponse(items, request.url));
      }),
    );

    renderOrdersManager();

    expect((await screen.findAllByText('Ada Lovelace')).length).toBeGreaterThan(0);

    await userEvent.type(screen.getByPlaceholderText('ordersManager.searchPlaceholder'), 'Grace');

    expect(screen.getAllByText('Ada Lovelace').length).toBeGreaterThan(0);
    expect(await screen.findByText('ordersManager.loading.refreshing')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryAllByText('Ada Lovelace')).toHaveLength(0);
    });
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

    expect(await screen.findAllByText('Grace Hopper')).not.toHaveLength(0);
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

    expect((await screen.findAllByText('Ada Lovelace')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Grace Hopper').length).toBeGreaterThan(0);

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'ordersManager.filters.statusLabel' }), '3');

    await waitFor(() => {
      expect(screen.queryAllByText('Ada Lovelace')).toHaveLength(0);
    });
    expect(screen.getAllByText('Grace Hopper').length).toBeGreaterThan(0);
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

    expect((await screen.findAllByText('Ada Lovelace')).length).toBeGreaterThan(0);

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
      expect(screen.queryAllByText('Ada Lovelace')).toHaveLength(0);
    });
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

    expect((await screen.findAllByText('Margaret Hamilton')).length).toBeGreaterThan(0);

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

    expect((await screen.findAllByText('Dorothy Vaughan')).length).toBeGreaterThan(0);

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

    expect((await screen.findAllByText('Mary Jackson')).length).toBeGreaterThan(0);

    const deliverySelects = screen.getAllByLabelText('ordersManager.address.delivery');
    await userEvent.selectOptions(deliverySelects[0], '1');

    await waitFor(() => {
      expect(toastMock.success).toHaveBeenCalled();
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

    expect((await screen.findAllByText('Annie Easley')).length).toBeGreaterThan(0);

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

    expect((await screen.findAllByText('Sally Ride')).length).toBeGreaterThan(0);

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

    expect(await screen.findByRole('combobox', { name: 'ordersManager.filters.statusLabel' })).toBeInTheDocument();
    expect(await screen.findByRole('combobox', { name: 'ordersManager.bulk.statusLabel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ordersManager.bulk.applyStatus' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'ordersManager.export.selectedAction' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'ordersManager.export.confirmedAction' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ordersManager.shoppingList.selectedAction' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'ordersManager.shoppingList.dispatchedAction' })).toBeInTheDocument();
  });

  it('exports confirmed orders and marks them as dispatched', async () => {
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
    const exportBodies: Array<Record<string, unknown>> = [];

    server.use(
      http.get('/api/ecotrack/catalog', () => HttpResponse.json({
        wilayas: [{ wilayaId: 16, name: 'Alger' }],
        communes: [{ communeId: 42, wilayaId: 16, name: 'Bab Ezzouar', postalCode: '1621', hasStopDesk: true }],
        serviceFees: [{ serviceType: 'livraison', wilayaId: 16, homeFee: '200', stopDeskFee: '150' }],
        weightFees: [],
        lastSync: null,
      })),
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
      http.get('/api/orders/export', () => HttpResponse.json({ job: null })),
      http.post('/api/orders/export', async ({ request }) => {
        exportBodies.push(await request.json() as Record<string, unknown>);
        return HttpResponse.json({
          job: {
            id: 'job-1',
            status: 'queued',
            fileName: 'confirmed-orders-export-20260331-120000.xlsx',
            progress: { phase: 'queued', current: 0, total: 0, percentage: 0 },
            errorMessage: null,
            downloadPath: null,
          },
        });
      }),
    );

    renderOrdersManager();

    await userEvent.click((await screen.findAllByRole('button', { name: 'ordersManager.export.confirmedAction' }))[0]);

    expect(await screen.findByText('Grace Hopper')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'ordersManager.export.confirmAndDispatch' }));

    await waitFor(() => {
      expect(exportBodies).toContainEqual({ mode: 'confirmed', orderIds: [21] });
    });
  });

  it('builds a shopping list for dispatched orders and opens a print view', async () => {
    const dispatchedItems = [
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
    const dispatchedOrdersResponse = {
      writable: true,
      items: dispatchedItems,
      pagination: {
        page: 1,
        limit: 100,
        totalItems: dispatchedItems.length,
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
      http.get('/api/ecotrack/catalog', () => HttpResponse.json({
        wilayas: [{ wilayaId: 16, name: 'Alger' }],
        communes: [{ communeId: 42, wilayaId: 16, name: 'Bab Ezzouar', postalCode: '1621', hasStopDesk: true }],
        serviceFees: [{ serviceType: 'livraison', wilayaId: 16, homeFee: '200', stopDeskFee: '150' }],
        weightFees: [],
        lastSync: null,
      })),
      http.get('/api/orders', ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get('confirmed') === '3') {
          return HttpResponse.json(dispatchedOrdersResponse);
        }

        return HttpResponse.json(emptyOrdersResponse);
      }),
      http.get('/api/brands/9', () => HttpResponse.json({ id: 9, name: 'Acme' })),
      http.get('/api/brands/10', () => HttpResponse.json({ id: 10, name: 'Globex' })),
      http.get('/api/products/1', () => HttpResponse.json({ item: { id: 1, inventoryQuantity: 5 } })),
      http.get('/api/products/2', () => HttpResponse.json({ item: { id: 2, inventoryQuantity: 0 } })),
    );

    renderOrdersManager();

    await userEvent.click((await screen.findAllByRole('button', { name: 'ordersManager.shoppingList.dispatchedAction' }))[0]);

    expect(await screen.findByText('Acme')).toBeInTheDocument();
    expect(screen.getByText('Chair x2')).toBeInTheDocument();
    expect(screen.getAllByText(/Blue fabric/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Handle gently/).length).toBeGreaterThan(0);
    expect(screen.getByText('Chair x2').closest('div.rounded-lg')).toHaveClass('bg-emerald-50');
    expect(screen.getAllByRole('img', { name: 'Chair' }).length).toBeGreaterThan(0);

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
    expect(closeDocumentSpy).toHaveBeenCalled();
  });
