import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  EcotrackShipmentListItem,
  EcotrackShipmentsResponse,
} from '../../lib/ecotrack-admin-contracts';
import { OrdersEcotrackManager } from './orders-ecotrack-manager';

const { surfaceDetailsMock, toastMock } = vi.hoisted(() => ({
  surfaceDetailsMock: vi.fn(),
  toastMock: {
    loading: vi.fn(() => 'toast-id'),
    success: vi.fn(),
    error: vi.fn(),
    criticalError: vi.fn(),
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

vi.mock('../../lib/toast', () => ({
  toast: toastMock,
}));

vi.mock('../admin-ai-surface-context', () => ({
  useAdminAiSurfaceDetails: surfaceDetailsMock,
}));

function renderOrdersEcotrackManager({
  initialOrders,
}: {
  initialOrders?: Parameters<typeof OrdersEcotrackManager>[0]['initialOrders'];
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <OrdersEcotrackManager
        initialCatalog={{
          wilayas: [{ wilayaId: 16, name: 'Alger' }],
          communes: [
            {
              communeId: 42,
              wilayaId: 16,
              name: 'Bab Ezzouar',
              postalCode: '1621',
              hasStopDesk: true,
            },
          ],
          serviceFees: [],
          weightFees: [],
          lastSync: null,
        }}
        initialOrders={initialOrders ?? buildInitialOrders()}
      />
    </QueryClientProvider>,
  );
}

function buildShipment(
  orderId: number,
  fullName: string,
  trackingNumber: string,
  phoneNumber1: string,
  productTitle: string,
  overrides: Partial<EcotrackShipmentListItem> = {},
): EcotrackShipmentListItem {
  return {
    orderId,
    reference: String(orderId),
    trackingNumber,
    provider: 'delivro',
    createdAt: '2026-04-08T08:00:00.000Z',
    updatedAt: '2026-04-08T08:00:00.000Z',
    firstName: fullName.split(' ')[0] ?? fullName,
    lastName: fullName.split(' ').slice(1).join(' ') || null,
    fullName,
    phoneNumber1,
    phoneNumber2: null,
    delivery: 1,
    deliveryLabel: 'office' as const,
    state: 16,
    stateName: 'Alger',
    city: 'Bab Ezzouar',
    homeAddress: `${orderId} Example street`,
    orderProducts: [
      {
        productId: orderId,
        rawValue: String(orderId),
        title: productTitle,
        unitPrice: 1200,
        quantity: 1,
        lineTotal: 1200,
        thumbnailUrl: null,
        missing: false,
      },
    ],
    subtotalOverride: null,
    productSubtotal: 1200,
    deliveryFee: 200,
    totalAmount: 1400,
    note: orderId === 11 ? 'Call first' : null,
    status: {
      currentStatus: 'en_livraison',
      driverPhone: orderId === 11 ? '0550000000' : null,
      estimatedFee: null,
      deskPhone: null,
      deskCommune: null,
      deskMapLink: null,
      deskAddress: null,
      lastStatusSyncedAt: '2026-04-08T08:15:00.000Z',
      lastTrackingSyncedAt: '2026-04-08T08:15:00.000Z',
      lastMajSyncedAt: '2026-04-08T08:15:00.000Z',
      isStatusStale: false,
      isTrackingStale: false,
      isMajStale: false,
    },
    canEdit: false,
    canDelete: false,
    canDispatch: false,
    canEditAndRecreate: true,
    canAddMaj: true,
    canAskReturn: true,
    canPrintLabel: true,
    ...overrides,
  };
}

function buildInitialOrders(count = 1): EcotrackShipmentsResponse {
  const items = [
    buildShipment(11, 'Ada Lovelace', 'TRK-11', '0550123456', 'Chair'),
    buildShipment(12, 'Grace Hopper', 'TRK-12', '0550123457', 'Desk'),
  ].slice(0, count);

  return {
    writable: true,
    items,
    pagination: {
      page: 1,
      limit: 25,
      totalItems: items.length,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  };
}

function buildDispatchableOrders(count = 2): EcotrackShipmentsResponse {
  const orders = buildInitialOrders(count);
  return {
    ...orders,
    items: orders.items.map((item) => ({
      ...item,
      status: {
        ...item.status,
        currentStatus: 'prete_a_expedier',
      },
      canDispatch: true,
      canEdit: true,
      canDelete: true,
      canEditAndRecreate: false,
      canAddMaj: false,
      canAskReturn: false,
    })),
  };
}

describe('OrdersEcotrackManager', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    toastMock.loading.mockReset();
    toastMock.loading.mockReturnValue('toast-id');
    toastMock.success.mockReset();
    toastMock.error.mockReset();
    toastMock.criticalError.mockReset();
    surfaceDetailsMock.mockReset();
  });

  it('fetches a changed filter immediately instead of seeding it with the initial unfiltered page', async () => {
    const filtered = buildInitialOrders(2);
    filtered.items = [filtered.items[1]!];
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      return Response.json(url.includes('/recovery') ? { items: [] } : filtered);
    });
    renderOrdersEcotrackManager({ initialOrders: buildInitialOrders() });
    expect(screen.getAllByText(/Ada Lovelace/).length).toBeGreaterThan(0);
    fireEvent.change(
      screen.getByRole('combobox', { name: 'ordersEcotrackManager.filters.statusLabel' }),
      {
        target: { value: 'payed' },
      },
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('status=payed'),
        expect.any(Object),
      ),
    );
    await waitFor(() => expect(screen.queryByText(/Ada Lovelace/)).not.toBeInTheDocument());
    expect(screen.getAllByText(/Grace Hopper/).length).toBeGreaterThan(0);
  });

  it('publishes the live shipment filters and selection to the admin assistant', () => {
    renderOrdersEcotrackManager({
      initialOrders: buildInitialOrders(2),
    });

    expect(surfaceDetailsMock).toHaveBeenLastCalledWith({
      filters: {
        page: 1,
        search: '',
        status: 'all',
        staleOnly: false,
        sortKey: 'createdAt',
        sortDirection: 'desc',
      },
      selection: { entityType: 'order', ids: [], focusedId: null },
    });
    fireEvent.click(screen.getAllByRole('checkbox')[1]!);
    expect(surfaceDetailsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        selection: { entityType: 'order', ids: [11], focusedId: null },
      }),
    );
  });

  it('renders the ECOTRACK shipments table with the requested columns', async () => {
    renderOrdersEcotrackManager();

    expect(screen.getByText('nav.ecotrackShipments')).toBeInTheDocument();
    expect(screen.queryByText('ordersEcotrackManager.description')).not.toBeInTheDocument();
    expect(screen.getByText('ordersEcotrackManager.columns.trackingNumber')).toBeInTheDocument();
    expect(screen.getAllByText('ordersEcotrackManager.columns.address').length).toBeGreaterThan(0);
    expect(screen.getAllByText('ordersEcotrackManager.columns.products').length).toBeGreaterThan(0);
    expect(screen.getAllByText('ordersEcotrackManager.columns.amount').length).toBeGreaterThan(0);
    expect(screen.getAllByText('ordersEcotrackManager.columns.status').length).toBeGreaterThan(0);
    expect(screen.getAllByText('TRK-11').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /TRK-11.*Ada Lovelace/ }).length).toBeGreaterThan(
      0,
    );
    expect(
      screen.getByLabelText('ordersEcotrackManager.fields.scanTrackingNumber'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'ordersEcotrackManager.actions.refreshVisible' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'ordersEcotrackManager.actions.dispatchReady' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'ordersEcotrackManager.actions.showHistorySelected' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'ordersEcotrackManager.actions.label' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'ordersEcotrackManager.actions.refresh' }),
    ).not.toBeInTheDocument();
  });

  it('renders the canonical ECOTRACK workspace', () => {
    const view = renderOrdersEcotrackManager({ initialOrders: buildInitialOrders(2) });

    expect(screen.getByRole('heading', { level: 1, name: 'nav.ecotrackShipments' })).toHaveClass(
      'sr-only',
      'lg:not-sr-only',
    );
    expect(view.container.querySelectorAll('[data-workspace-frame]')).toHaveLength(1);
    expect(view.container.querySelectorAll('[data-workspace-header]')).toHaveLength(1);
    expect(view.container.querySelectorAll('[data-workspace-toolbar]')).toHaveLength(1);
    expect(
      screen.getByLabelText('ordersEcotrackManager.fields.scanTrackingNumber'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'ordersEcotrackManager.actions.refreshVisible',
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('TRK-11').length).toBeGreaterThan(0);
    expect(screen.getByRole('region', { name: 'nav.ecotrackShipments' })).toHaveAttribute(
      'tabindex',
      '0',
    );
  });

  it('opens the flat shipment inspector from the refined ledger', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
      String(input).includes('/api/orders/ecotrack/recovery')
        ? Response.json({ items: [] })
        : new Response(
            JSON.stringify({
              item: {
                ...buildShipment(11, 'Ada Lovelace', 'TRK-11', '0550123456', 'Chair'),
                majEntries: [],
                trackingEvents: [],
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
    );

    renderOrdersEcotrackManager({
      initialOrders: buildInitialOrders(2),
    });
    fireEvent.click(screen.getAllByRole('button', { name: /TRK-11/ })[0]!);

    expect(
      screen.getAllByRole('heading', { name: 'ordersEcotrackManager.columns.client' }).length,
    ).toBeGreaterThan(0);
    expect(
      (await screen.findAllByText('ordersEcotrackManager.history.emptyTimeline')).length,
    ).toBeGreaterThan(0);
  }, 15_000);

  it('closes the filter disclosure on outside interaction', () => {
    const view = renderOrdersEcotrackManager({
      initialOrders: buildInitialOrders(2),
    });
    expect(view.container.querySelector('[data-mobile-ecotrack-controls]')).toHaveClass(
      'grid-cols-[minmax(0,1fr)_auto]',
    );
    expect(
      screen.getByRole('button', {
        name: 'ordersEcotrackManager.actions.scanTrackingNumber',
      }),
    ).toBeInTheDocument();
    const filters = screen.getByRole('button', {
      name: 'ordersEcotrackManager.filters.sortKeyLabel',
    });

    fireEvent.click(filters);
    expect(filters).toHaveAttribute('aria-expanded', 'true');
    fireEvent.pointerDown(document.body);
    expect(filters).toHaveAttribute('aria-expanded', 'false');
  });

  it('reveals complete bulk operations only after selecting a shipment row', async () => {
    const user = userEvent.setup();
    renderOrdersEcotrackManager({
      initialOrders: buildDispatchableOrders(2),
    });

    expect(
      screen.queryByRole('button', { name: 'ordersEcotrackManager.actions.printSelected' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('checkbox')[1]!);

    expect(
      screen.getByRole('button', { name: 'ordersEcotrackManager.actions.dispatchSelected' }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', {
        name: 'ordersEcotrackManager.actions.dispatchSelected menu',
      }),
    );
    expect(
      screen.getByRole('menuitem', { name: 'ordersEcotrackManager.actions.printSelected' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'ordersEcotrackManager.actions.refreshSelected' }),
    ).toBeInTheDocument();
  });

  it('shows a partial-success toast and invalidates shipments after a mixed refresh result', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/api/orders/ecotrack/recovery')) return Response.json({ items: [] });

      if (url.includes('/api/orders/ecotrack/shipments/refresh')) {
        return new Response(
          JSON.stringify({
            ok: true,
            items: [{ orderId: 11 }],
            failures: [{ orderId: 12, trackingNumber: 'TRK-12', message: 'MAJ failed' }],
            successCount: 1,
            failureCount: 1,
            totalRequested: 2,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.includes('/api/orders/ecotrack/shipments')) {
        return new Response(
          JSON.stringify({
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
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    renderOrdersEcotrackManager({ initialOrders: buildInitialOrders(2) });

    await user.click(
      screen.getAllByRole('button', { name: 'ordersEcotrackManager.actions.refreshVisible' })[0]!,
    );

    await waitFor(() => {
      expect(toastMock.criticalError).toHaveBeenCalledWith(
        'ordersEcotrackManager.notifications.refresh.partial:1,1 MAJ failed',
        { id: 'toast-id' },
      );
    });
    expect(
      fetchMock.mock.calls.filter(
        ([input]) => !String(input).includes('/api/orders/ecotrack/recovery'),
      ),
    ).toHaveLength(2);
  });

  it('shows an error toast and skips invalidation when all refreshes fail', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/api/orders/ecotrack/recovery')) return Response.json({ items: [] });

      if (url.includes('/api/orders/ecotrack/shipments/refresh')) {
        return new Response(
          JSON.stringify({
            ok: false,
            items: [],
            failures: [{ orderId: 11, trackingNumber: 'TRK-11', message: 'Status fetch failed' }],
            successCount: 0,
            failureCount: 1,
            totalRequested: 1,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    renderOrdersEcotrackManager({ initialOrders: buildDispatchableOrders(2) });

    await user.click(
      screen.getAllByRole('button', { name: 'ordersEcotrackManager.actions.refreshVisible' })[0]!,
    );

    await waitFor(() => {
      expect(toastMock.criticalError).toHaveBeenCalledWith(
        'ordersEcotrackManager.notifications.refresh.allFailed Status fetch failed',
        { id: 'toast-id' },
      );
    });
    expect(
      fetchMock.mock.calls.filter(
        ([input]) => !String(input).includes('/api/orders/ecotrack/recovery'),
      ),
    ).toHaveLength(1);
  });

  it('shows a critical partial-success toast for bulk dispatch failures and still invalidates queries', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/api/orders/ecotrack/recovery')) return Response.json({ items: [] });

      if (url.includes('/api/orders/ecotrack/shipments/dispatch')) {
        return new Response(
          JSON.stringify({
            ok: true,
            items: [{ orderId: 11 }],
            failures: [
              {
                orderId: 12,
                reference: '12',
                trackingNumber: 'TRK-12',
                message:
                  'Order #12 / Ref 12 / Tracking TRK-12: The shipment cannot be dispatched in its current Ecotrack state.',
              },
            ],
            successCount: 1,
            failureCount: 1,
            totalRequested: 2,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.includes('/api/orders/ecotrack/shipments')) {
        return new Response(JSON.stringify(buildInitialOrders(2)), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    renderOrdersEcotrackManager({ initialOrders: buildDispatchableOrders(2) });

    await user.click(
      screen.getByRole('button', { name: 'ordersEcotrackManager.actions.dispatchReady' }),
    );
    const dispatchButtons = await screen.findAllByRole('button', {
      name: 'ordersEcotrackManager.actions.dispatch',
    });
    await user.click(dispatchButtons.at(-1)!);

    await waitFor(() => {
      expect(toastMock.criticalError).toHaveBeenCalledWith(
        'ordersEcotrackManager.notifications.dispatch.partial:1,1 Order #12 / Ref 12 / Tracking TRK-12: The shipment cannot be dispatched in its current Ecotrack state.',
        { id: 'toast-id' },
      );
    });
    expect(
      fetchMock.mock.calls.filter(
        ([input]) => !String(input).includes('/api/orders/ecotrack/recovery'),
      ),
    ).toHaveLength(2);
  });

  it('downloads successful labels and shows a critical partial toast for failed labels', async () => {
    const user = userEvent.setup();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const openMock = vi.spyOn(window, 'open').mockImplementation(() => null);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/api/orders/ecotrack/recovery')) return Response.json({ items: [] });

      if (url.includes('/api/orders/ecotrack/shipments/labels')) {
        return new Response(
          JSON.stringify({
            ok: true,
            items: [{ orderId: 11, reference: '11', trackingNumber: 'TRK-11' }],
            failures: [
              {
                orderId: 12,
                reference: '12',
                trackingNumber: 'TRK-12',
                message:
                  'Order #12 / Ref 12 / Tracking TRK-12: The label is unavailable from Ecotrack.',
              },
            ],
            successCount: 1,
            failureCount: 1,
            totalRequested: 2,
            fileName: 'ecotrack-labels-2026-05-02.pdf',
            pdfBase64: 'JVBERi0xLjcK',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    renderOrdersEcotrackManager({ initialOrders: buildInitialOrders(2) });

    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[1]!);
    await user.click(checkboxes[2]!);
    await user.click(
      screen.getByRole('button', {
        name: 'ordersEcotrackManager.actions.dispatchSelected menu',
      }),
    );
    await user.click(
      screen.getByRole('menuitem', { name: 'ordersEcotrackManager.actions.printSelected' }),
    );

    await waitFor(() => {
      expect(openMock).toHaveBeenCalledWith('blob:mock', '_blank', 'noopener,noreferrer');
      expect(toastMock.criticalError).toHaveBeenCalledWith(
        'ordersEcotrackManager.notifications.labels.partial:1,1 Order #12 / Ref 12 / Tracking TRK-12: The label is unavailable from Ecotrack.',
        { id: 'toast-id' },
      );
    });
    expect(
      fetchMock.mock.calls.filter(
        ([input]) => !String(input).includes('/api/orders/ecotrack/recovery'),
      ),
    ).toHaveLength(1);
  });

  it('shows status-allowed row actions inside the row dropdown menu', async () => {
    const user = userEvent.setup();

    renderOrdersEcotrackManager({ initialOrders: buildDispatchableOrders(2) });

    const menuButtons = screen.getAllByRole('button', {
      name: 'ordersEcotrackManager.actions.dispatch menu',
    });
    await user.click(menuButtons[0]!);

    expect(await screen.findByRole('menuitem', { name: 'actions.edit' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'actions.delete' })).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'ordersEcotrackManager.actions.dispatch' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'ordersEcotrackManager.actions.refresh' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'ordersEcotrackManager.actions.label' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'ordersEcotrackManager.actions.showHistory' }),
    ).toBeInTheDocument();
  });

  it('opens the finalize dialog when a dispatchable tracking number is scanned', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/api/orders/ecotrack/recovery')) return Response.json({ items: [] });

      if (url.includes('/api/orders/ecotrack/shipments?')) {
        return new Response(JSON.stringify(buildDispatchableOrders(2)), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    renderOrdersEcotrackManager({ initialOrders: buildInitialOrders(2) });

    await user.type(
      screen.getByLabelText('ordersEcotrackManager.fields.scanTrackingNumber'),
      ' TRK-11 ',
    );
    await user.click(
      screen.getByRole('button', { name: 'ordersEcotrackManager.actions.scanTrackingNumber' }),
    );

    expect(
      await screen.findByText('ordersEcotrackManager.dialogs.finalizeTitle'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('ordersEcotrackManager.dialogs.finalizeDescription:Ada Lovelace'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'ordersEcotrackManager.actions.saveOnly' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'ordersEcotrackManager.actions.saveAndDispatch' }),
    ).toBeInTheDocument();
    expect(toastMock.success).toHaveBeenCalledWith(
      'ordersEcotrackManager.notifications.scan.success:TRK-11',
      { id: 'toast-id' },
    );
    expect(
      fetchMock.mock.calls.filter(
        ([input]) => !String(input).includes('/api/orders/ecotrack/recovery'),
      ),
    ).toHaveLength(1);
  });

  it('shows an error toast when a scanned tracking number is not found', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/api/orders/ecotrack/recovery')) return Response.json({ items: [] });

      if (url.includes('/api/orders/ecotrack/shipments?')) {
        return new Response(JSON.stringify(buildDispatchableOrders(2)), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    renderOrdersEcotrackManager({ initialOrders: buildInitialOrders(2) });

    await user.type(
      screen.getByLabelText('ordersEcotrackManager.fields.scanTrackingNumber'),
      'TRK-999',
    );
    await user.click(
      screen.getByRole('button', { name: 'ordersEcotrackManager.actions.scanTrackingNumber' }),
    );

    await waitFor(() => {
      expect(toastMock.criticalError).toHaveBeenCalledWith(
        'ordersEcotrackManager.notifications.scan.notFound:TRK-999',
        { id: 'toast-id' },
      );
    });
    expect(
      screen.queryByText('ordersEcotrackManager.dialogs.finalizeTitle'),
    ).not.toBeInTheDocument();
  });

  it('shows a status-based error toast when a scanned tracking number is not dispatchable', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/api/orders/ecotrack/recovery')) return Response.json({ items: [] });

      if (url.includes('/api/orders/ecotrack/shipments?')) {
        return new Response(JSON.stringify(buildInitialOrders(2)), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    renderOrdersEcotrackManager({ initialOrders: buildInitialOrders(2) });

    await user.type(
      screen.getByLabelText('ordersEcotrackManager.fields.scanTrackingNumber'),
      'TRK-11',
    );
    await user.click(
      screen.getByRole('button', { name: 'ordersEcotrackManager.actions.scanTrackingNumber' }),
    );

    await waitFor(() => {
      expect(toastMock.criticalError).toHaveBeenCalledWith(
        'ordersEcotrackManager.notifications.scan.notDispatchable:TRK-11,ordersEcotrackManager.statuses.en_livraison',
        { id: 'toast-id' },
      );
    });
    expect(
      screen.queryByText('ordersEcotrackManager.dialogs.finalizeTitle'),
    ).not.toBeInTheDocument();
  });

  it('uses patch only when saving from finalize mode without dispatch', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/api/orders/ecotrack/recovery')) return Response.json({ items: [] });

      if (url.includes('/api/orders/ecotrack/shipments?')) {
        return new Response(JSON.stringify(buildDispatchableOrders(2)), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.includes('/api/orders/ecotrack/shipments/11') && init?.method === 'PATCH') {
        return new Response(
          JSON.stringify({
            ok: true,
            item: buildShipment(11, 'Ada Lovelace', 'TRK-11', '0550123456', 'Chair', {
              canEdit: true,
              canDispatch: true,
            }),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response(JSON.stringify(buildDispatchableOrders(2)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    renderOrdersEcotrackManager({ initialOrders: buildDispatchableOrders(2) });

    await user.type(
      screen.getByLabelText('ordersEcotrackManager.fields.scanTrackingNumber'),
      'TRK-11',
    );
    await user.click(
      screen.getByRole('button', { name: 'ordersEcotrackManager.actions.scanTrackingNumber' }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'ordersEcotrackManager.actions.saveOnly' }),
    );

    await waitFor(() => {
      expect(toastMock.success).toHaveBeenCalledWith(
        'ordersEcotrackManager.notifications.update.success',
        { id: 'toast-id' },
      );
    });

    const calledUrls = fetchMock.mock.calls.map(([input]) =>
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url,
    );
    expect(calledUrls.some((url) => url.includes('/api/orders/ecotrack/shipments/dispatch'))).toBe(
      false,
    );
    expect(calledUrls.some((url) => url.includes('/api/orders/ecotrack/shipments/11'))).toBe(true);
  });

  it('patches then dispatches when saving and dispatching from finalize mode', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/api/orders/ecotrack/recovery')) return Response.json({ items: [] });

      if (url.includes('/api/orders/ecotrack/shipments?')) {
        return new Response(JSON.stringify(buildDispatchableOrders(2)), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.includes('/api/orders/ecotrack/shipments/11') && init?.method === 'PATCH') {
        return new Response(
          JSON.stringify({
            ok: true,
            item: buildShipment(11, 'Ada Lovelace', 'TRK-11', '0550123456', 'Chair', {
              canEdit: true,
              canDispatch: true,
            }),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.includes('/api/orders/ecotrack/shipments/dispatch')) {
        return new Response(
          JSON.stringify({
            ok: true,
            items: [{ orderId: 11 }],
            failures: [],
            successCount: 1,
            failureCount: 0,
            totalRequested: 1,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response(JSON.stringify(buildDispatchableOrders(2)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    renderOrdersEcotrackManager({ initialOrders: buildDispatchableOrders(2) });

    await user.type(
      screen.getByLabelText('ordersEcotrackManager.fields.scanTrackingNumber'),
      'TRK-11',
    );
    await user.click(
      screen.getByRole('button', { name: 'ordersEcotrackManager.actions.scanTrackingNumber' }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'ordersEcotrackManager.actions.saveAndDispatch' }),
    );

    await waitFor(() => {
      expect(toastMock.success).toHaveBeenCalledWith(
        'ordersEcotrackManager.notifications.finalize.success',
        { id: 'toast-id' },
      );
    });

    const calledUrls = fetchMock.mock.calls.map(([input]) =>
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url,
    );
    expect(calledUrls.some((url) => url.includes('/api/orders/ecotrack/shipments/11'))).toBe(true);
    expect(calledUrls.some((url) => url.includes('/api/orders/ecotrack/shipments/dispatch'))).toBe(
      true,
    );
  });

  it('shows a partial failure toast when save succeeds but dispatch fails from finalize mode', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/api/orders/ecotrack/recovery')) return Response.json({ items: [] });

      if (url.includes('/api/orders/ecotrack/shipments?')) {
        return new Response(JSON.stringify(buildDispatchableOrders(2)), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.includes('/api/orders/ecotrack/shipments/11') && init?.method === 'PATCH') {
        return new Response(
          JSON.stringify({
            ok: true,
            item: buildShipment(11, 'Ada Lovelace', 'TRK-11', '0550123456', 'Chair', {
              canEdit: true,
              canDispatch: true,
            }),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.includes('/api/orders/ecotrack/shipments/dispatch')) {
        return new Response(
          JSON.stringify({
            ok: true,
            items: [],
            failures: [
              {
                orderId: 11,
                reference: '11',
                trackingNumber: 'TRK-11',
                message: 'Dispatch blocked',
              },
            ],
            successCount: 0,
            failureCount: 1,
            totalRequested: 1,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response(JSON.stringify(buildDispatchableOrders(2)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    renderOrdersEcotrackManager({ initialOrders: buildDispatchableOrders(2) });

    await user.type(
      screen.getByLabelText('ordersEcotrackManager.fields.scanTrackingNumber'),
      'TRK-11',
    );
    await user.click(
      screen.getByRole('button', { name: 'ordersEcotrackManager.actions.scanTrackingNumber' }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'ordersEcotrackManager.actions.saveAndDispatch' }),
    );

    await waitFor(() => {
      expect(toastMock.criticalError).toHaveBeenCalledWith(
        'ordersEcotrackManager.notifications.finalize.partialFailure:Dispatch blocked',
        { id: 'toast-id' },
      );
    });
  });

  it('does not submit duplicate scan lookups while a scan request is pending', async () => {
    const user = userEvent.setup();
    let resolveLookup: ((value: Response) => void) | null = null;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/api/orders/ecotrack/recovery')) return Response.json({ items: [] });

      if (url.includes('/api/orders/ecotrack/shipments?')) {
        return new Promise((resolve) => {
          resolveLookup = resolve;
        });
      }

      return Promise.resolve(
        new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
      );
    });

    renderOrdersEcotrackManager({ initialOrders: buildDispatchableOrders(2) });

    const input = screen.getByLabelText('ordersEcotrackManager.fields.scanTrackingNumber');
    await user.type(input, 'TRK-11');
    await user.click(
      screen.getByRole('button', { name: 'ordersEcotrackManager.actions.scanTrackingNumber' }),
    );
    await user.keyboard('{Enter}');

    expect(
      fetchMock.mock.calls.filter(
        ([input]) => !String(input).includes('/api/orders/ecotrack/recovery'),
      ),
    ).toHaveLength(1);

    (resolveLookup as unknown as (value: Response) => void)(
      new Response(JSON.stringify(buildDispatchableOrders(2)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    expect(
      await screen.findByText('ordersEcotrackManager.dialogs.finalizeTitle'),
    ).toBeInTheDocument();
  });
});
