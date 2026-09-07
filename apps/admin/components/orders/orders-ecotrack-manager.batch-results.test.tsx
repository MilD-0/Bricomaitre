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
});
