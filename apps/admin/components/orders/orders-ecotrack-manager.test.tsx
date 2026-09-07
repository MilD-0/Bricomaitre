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
});
