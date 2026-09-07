import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  addMaj: vi.fn(),
  deleteShipment: vi.fn(),
  dispatchBatch: vi.fn(),
  loadDetail: vi.fn(),
  loadPage: vi.fn(),
  recreateShipment: vi.fn(),
  refreshBatch: vi.fn(),
  requestReturn: vi.fn(),
  updateShipment: vi.fn(),
}));

vi.mock('./admin-ecotrack-orders-data', () => ({
  addEcotrackMaj: mocks.addMaj,
  deletePostedEcotrackOrder: mocks.deleteShipment,
  dispatchEcotrackOrdersBatch: mocks.dispatchBatch,
  loadEcotrackOrderDetail: mocks.loadDetail,
  loadEcotrackOrdersPageData: mocks.loadPage,
  recreatePostedEcotrackOrder: mocks.recreateShipment,
  refreshEcotrackOrdersBatch: mocks.refreshBatch,
  requestEcotrackReturn: mocks.requestReturn,
  updatePostedEcotrackOrder: mocks.updateShipment,
}));

import {
  adminAiEcotrackShipmentChangeSchema,
  changeAdminAiEcotrackShipments,
  inspectAdminAiEcotrackShipments,
  manageAdminAiEcotrackShipments,
} from './admin-ai-ecotrack-shipments';

const actor = { email: 'admin@bricomaitre.com', name: 'Admin' };

it('reads stored shipment evidence without enabling carrier refresh for evaluation', async () => {
  mocks.loadDetail.mockResolvedValue(shipment());
  mocks.loadPage.mockResolvedValue({ items: [], pagination: { totalItems: 0 } });
  await expect(
    inspectAdminAiEcotrackShipments({ scope: 'exact', orderIds: [91] }, { refresh: false }),
  ).resolves.toMatchObject({ refreshEnabled: false, foundCount: 1 });
  expect(mocks.loadDetail).toHaveBeenCalledWith(91, undefined, { refresh: false });
  await inspectAdminAiEcotrackShipments({ scope: 'filtered' }, { refresh: false });
  expect(mocks.loadPage).toHaveBeenCalledWith(expect.anything(), false, {
    ensureFreshVisiblePage: false,
  });
});

function shipment(overrides: Record<string, unknown> = {}) {
  return {
    orderId: 91,
    reference: '91',
    trackingNumber: 'TRK-91',
    provider: 'delivro',
    createdAt: '2026-08-24T08:00:00.000Z',
    updatedAt: '2026-08-24T09:00:00.000Z',
    firstName: 'Ada',
    lastName: 'Lovelace',
    fullName: 'Ada Lovelace',
    phoneNumber1: '0550000000',
    phoneNumber2: null,
    delivery: 0,
    deliveryLabel: 'home',
    state: 16,
    stateName: 'Alger',
    city: 'Alger Centre',
    homeAddress: '1 rue des Outils',
    orderProducts: [
      { productId: 12, title: 'Perceuse', quantity: 2, lineTotal: 30_000, rawValue: '12' },
    ],
    subtotalOverride: null,
    productSubtotal: 30_000,
    deliveryFee: 600,
    totalAmount: 30_600,
    note: 'Appeler avant livraison',
    status: {
      currentStatus: 'prete_a_expedier',
      driverPhone: null,
      estimatedFee: 600,
      deskPhone: null,
      deskCommune: null,
      deskMapLink: null,
      deskAddress: null,
      lastStatusSyncedAt: '2026-08-24T09:00:00.000Z',
      lastTrackingSyncedAt: '2026-08-24T09:00:00.000Z',
      lastMajSyncedAt: '2026-08-24T09:00:00.000Z',
      isStatusStale: false,
      isTrackingStale: false,
      isMajStale: false,
    },
    canEdit: true,
    canDelete: true,
    canDispatch: true,
    canEditAndRecreate: false,
    canAddMaj: true,
    canAskReturn: false,
    canPrintLabel: true,
    majEntries: [],
    trackingEvents: [],
    ...overrides,
  };
}

describe('admin AI ECOTRACK shipment inspection', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses the native filtered ledger with fresh visible-page semantics', async () => {
    mocks.loadPage.mockResolvedValue({
      writable: true,
      items: [shipment()],
      pagination: { page: 2, limit: 25, totalItems: 30, totalPages: 2 },
    });

    await expect(
      inspectAdminAiEcotrackShipments({
        scope: 'filtered',
        page: 2,
        limit: 25,
        search: 'Ada',
        status: 'en_livraison',
        staleOnly: true,
        sortKey: 'lastStatusSyncedAt',
        sortDirection: 'asc',
      }),
    ).resolves.toMatchObject({ kind: 'ecotrack_shipments', scope: 'filtered' });
    expect(mocks.loadPage).toHaveBeenCalledWith(
      {
        page: 2,
        limit: 25,
        search: 'Ada',
        status: 'en_livraison',
        staleOnly: true,
        sortKey: 'lastStatusSyncedAt',
        sortDirection: 'asc',
      },
      true,
      { ensureFreshVisiblePage: true },
    );
  });

  it('returns complete exact history while preserving missing and provider failures', async () => {
    mocks.loadDetail
      .mockResolvedValueOnce(
        shipment({
          majEntries: [{ id: 1, remarque: 'Client appelé' }],
          trackingEvents: [{ id: 2, status: 'en_livraison' }],
        }),
      )
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('Emir timeout'));

    await expect(
      inspectAdminAiEcotrackShipments({ scope: 'exact', orderIds: [91, 92, 93, 91] }),
    ).resolves.toMatchObject({
      foundCount: 1,
      requestedCount: 3,
      items: [
        expect.objectContaining({
          orderId: 91,
          majEntries: [{ id: 1, remarque: 'Client appelé' }],
          trackingEvents: [{ id: 2, status: 'en_livraison' }],
        }),
      ],
      failures: [
        { orderId: 92, message: 'Order #92: ECOTRACK shipment not found.' },
        { orderId: 93, message: 'Emir timeout' },
      ],
    });
  });
});

describe('admin AI ECOTRACK shipment actions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('refreshes every unique requested shipment through the canonical batch', async () => {
    mocks.refreshBatch.mockResolvedValue({
      ok: true,
      items: [shipment()],
      failures: [],
      successCount: 1,
      failureCount: 0,
      totalRequested: 1,
    });

    await expect(
      manageAdminAiEcotrackShipments({ action: 'refresh', orderIds: [91, 91] }, actor),
    ).resolves.toMatchObject({ action: 'refresh', successCount: 1, failureCount: 0 });
    expect(mocks.refreshBatch).toHaveBeenCalledWith([91], actor);
  });

  it('dispatches the exact inspected cohort and preserves canonical partial failures', async () => {
    mocks.dispatchBatch.mockResolvedValue({
      ok: true,
      items: [shipment({ status: { ...shipment().status, currentStatus: 'en_ramassage' } })],
      failures: [{ orderId: 92, message: 'Shipment is no longer dispatchable.' }],
      successCount: 1,
      failureCount: 1,
      totalRequested: 2,
    });

    await expect(
      manageAdminAiEcotrackShipments(
        { action: 'dispatch', orderIds: [91, 92, 91], askCollection: true },
        actor,
      ),
    ).resolves.toMatchObject({
      action: 'dispatch',
      successCount: 1,
      failureCount: 1,
      items: [{ orderId: 91, currentStatus: 'en_ramassage' }],
      failures: [{ orderId: 92, message: 'Shipment is no longer dispatchable.' }],
    });
    expect(mocks.dispatchBatch).toHaveBeenCalledWith([91, 92], { askCollection: true }, actor);
  });

  it('continues MAJ updates after a per-shipment provider failure', async () => {
    mocks.addMaj
      .mockRejectedValueOnce(new Error('Order 91 rejected'))
      .mockResolvedValueOnce(shipment({ orderId: 92, reference: '92', trackingNumber: 'TRK-92' }));

    await expect(
      manageAdminAiEcotrackShipments(
        {
          action: 'add_update',
          items: [
            { orderId: 91, content: 'Client injoignable' },
            { orderId: 92, content: 'Nouvelle adresse confirmée' },
          ],
        },
        actor,
      ),
    ).resolves.toMatchObject({
      ok: true,
      successCount: 1,
      failureCount: 1,
      items: [{ orderId: 92 }],
      failures: [{ orderId: 91, message: 'Order 91 rejected' }],
    });
  });

  it('prepares authenticated label links only for currently printable shipments', async () => {
    mocks.loadDetail
      .mockResolvedValueOnce(shipment({ orderId: 91, canPrintLabel: true }))
      .mockResolvedValueOnce(shipment({ orderId: 92, canPrintLabel: false }));

    await expect(
      manageAdminAiEcotrackShipments({ action: 'prepare_labels', orderIds: [91, 92] }, actor),
    ).resolves.toMatchObject({
      successCount: 1,
      failureCount: 1,
      items: [
        {
          orderId: 91,
          downloadUrl: '/api/orders/ecotrack/shipments/91/label',
        },
      ],
      failures: [
        {
          orderId: 92,
          message: 'A label is not available for this shipment in its current state.',
        },
      ],
    });
  });

  it('continues exact shipment deletion after a canonical failure', async () => {
    mocks.deleteShipment
      .mockRejectedValueOnce(new Error('Order 91 can no longer be deleted.'))
      .mockResolvedValueOnce({ ok: true, inHouseOrderStatus: 'confirmed' });

    await expect(
      manageAdminAiEcotrackShipments({ action: 'delete', orderIds: [91, 92] }, actor),
    ).resolves.toMatchObject({
      successCount: 1,
      failureCount: 1,
      items: [{ orderId: 92, deleted: true, inHouseOrderStatus: 'confirmed' }],
      failures: [{ orderId: 91, message: 'Order 91 can no longer be deleted.' }],
    });
    expect(mocks.deleteShipment).toHaveBeenCalledTimes(2);
  });
});

describe('admin AI ECOTRACK shipment changes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('passes only explicit carrier changes so canonical state owns unmentioned fields', async () => {
    const current = shipment();
    mocks.loadDetail.mockResolvedValue(current);
    mocks.updateShipment.mockResolvedValue(
      shipment({ city: 'Bab Ezzouar', homeAddress: '12 rue des Outils' }),
    );

    await expect(
      changeAdminAiEcotrackShipments(
        {
          items: [
            {
              orderId: 91,
              mode: 'auto',
              operations: [
                { field: 'commune', value: 'Bab Ezzouar' },
                { field: 'homeAddress', value: '12 rue des Outils' },
              ],
            },
          ],
        },
        actor,
      ),
    ).resolves.toMatchObject({
      successCount: 1,
      items: [{ orderId: 91, operation: 'edit' }],
    });
    expect(mocks.updateShipment).toHaveBeenCalledWith(
      91,
      { city: 'Bab Ezzouar', homeAddress: '12 rue des Outils' },
      actor,
    );
    expect(mocks.recreateShipment).not.toHaveBeenCalled();
  });

  it('uses canonical recreation only when direct editing is unavailable and recreation is allowed', async () => {
    mocks.loadDetail.mockResolvedValue(
      shipment({ canEdit: false, canEditAndRecreate: true, trackingNumber: 'OLD-91' }),
    );
    mocks.recreateShipment.mockResolvedValue(
      shipment({ canEdit: false, canEditAndRecreate: true, trackingNumber: 'NEW-91' }),
    );

    await expect(
      changeAdminAiEcotrackShipments(
        {
          items: [
            {
              orderId: 91,
              mode: 'auto',
              operations: [{ field: 'phoneNumber1', value: '0551111111' }],
            },
          ],
        },
        actor,
      ),
    ).resolves.toMatchObject({
      items: [{ orderId: 91, trackingNumber: 'NEW-91', operation: 'recreate' }],
    });
    expect(mocks.recreateShipment).toHaveBeenCalledOnce();
    expect(mocks.updateShipment).not.toHaveBeenCalled();
  });

  it('rejects duplicate field operations before touching a live shipment', () => {
    expect(
      adminAiEcotrackShipmentChangeSchema.safeParse({
        items: [
          {
            orderId: 91,
            mode: 'auto',
            operations: [
              { field: 'commune', value: 'Bab Ezzouar' },
              { field: 'commune', value: 'Alger Centre' },
            ],
          },
        ],
      }).success,
    ).toBe(false);
  });
});
