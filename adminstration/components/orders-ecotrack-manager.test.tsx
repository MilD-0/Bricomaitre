import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OrdersEcotrackManager } from './orders-ecotrack-manager';

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    if (!values) {
      return key;
    }

    return `${key}:${Object.values(values).join(',')}`;
  },
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
          communes: [{ communeId: 42, wilayaId: 16, name: 'Bab Ezzouar', postalCode: '1621', hasStopDesk: true }],
          serviceFees: [],
          weightFees: [],
          lastSync: null,
        }}
        initialOrders={initialOrders ?? {
          writable: true,
          items: [{
            orderId: 11,
            reference: '11',
            trackingNumber: 'TRK-11',
            createdAt: '2026-04-08T08:00:00.000Z',
            updatedAt: '2026-04-08T08:00:00.000Z',
            firstName: 'Ada',
            lastName: 'Lovelace',
            fullName: 'Ada Lovelace',
            phoneNumber1: '0550123456',
            phoneNumber2: null,
            delivery: 1,
            deliveryLabel: 'office',
            state: 16,
            stateName: 'Alger',
            city: 'Bab Ezzouar',
            homeAddress: '12 Example street',
            orderProducts: [{ title: 'Chair', quantity: 2, lineTotal: 1200 }],
            productSubtotal: 1200,
            deliveryFee: 200,
            totalAmount: 1400,
            note: 'Call first',
            status: {
              currentStatus: 'en_livraison',
              driverPhone: '0550000000',
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
            canAddMaj: true,
            canAskReturn: true,
            canPrintLabel: true,
          }],
          pagination: {
            page: 1,
            limit: 25,
            totalItems: 1,
            totalPages: 1,
            hasNextPage: false,
            hasPreviousPage: false,
          },
        }}
      />
    </QueryClientProvider>,
  );
}

describe('OrdersEcotrackManager', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the ECOTRACK shipments table with the requested columns', async () => {
    renderOrdersEcotrackManager();

    expect(screen.getByText('nav.ecotrackShipments')).toBeInTheDocument();
    expect(screen.queryByText('ordersEcotrackManager.description')).not.toBeInTheDocument();
    expect(screen.getByText('ordersEcotrackManager.columns.trackingNumber')).toBeInTheDocument();
    expect(screen.getAllByText('ordersEcotrackManager.columns.client').length).toBeGreaterThan(0);
    expect(screen.getAllByText('ordersEcotrackManager.columns.address').length).toBeGreaterThan(0);
    expect(screen.getAllByText('ordersEcotrackManager.columns.products').length).toBeGreaterThan(0);
    expect(screen.getAllByText('ordersEcotrackManager.columns.amount').length).toBeGreaterThan(0);
    expect(screen.getAllByText('ordersEcotrackManager.columns.status').length).toBeGreaterThan(0);
    expect(screen.getAllByText('TRK-11').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Ada Lovelace').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'ordersEcotrackManager.actions.refreshVisible' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ordersEcotrackManager.actions.dispatchReady' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ordersEcotrackManager.actions.showHistorySelected' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ordersEcotrackManager.actions.label' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ordersEcotrackManager.actions.refresh' })).not.toBeInTheDocument();
  });
});
