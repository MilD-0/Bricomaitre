import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
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
});
