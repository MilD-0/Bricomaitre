import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  activeShipment: vi.fn(),
  commercial: vi.fn(),
  createToken: vi.fn(),
  insert: vi.fn(),
  loadDetail: vi.fn(),
  mutate: vi.fn(),
  normalizePhone: vi.fn(),
  readCatalog: vi.fn(),
  resolveFee: vi.fn(),
  reporting: vi.fn(),
}));

vi.mock('@bric/storefront-core/order-access', () => ({
  createPublicOrderToken: mocks.createToken,
}));
vi.mock('@bric/storefront-core/order-commercial', () => ({
  resolveOrderCommercialState: mocks.commercial,
}));
vi.mock('@bric/storefront-core/order-write', () => ({ insertCanonicalOrder: mocks.insert }));
vi.mock('@bric/storefront-core/meta', () => ({ normalizeAlgeriaPhone: mocks.normalizePhone }));
vi.mock('./action-history', () => ({
  mutateEntityWithHistory: mocks.mutate,
  mutateEntityWithHistoryTransaction: mocks.mutate,
}));
vi.mock('./ecotrack-mutations', () => ({ assertNoUnresolvedEcotrackMutation: vi.fn() }));
vi.mock('./admin-orders-data', () => ({ loadOrderDetail: mocks.loadDetail }));
vi.mock('./ecotrack', () => ({
  readEcotrackCatalog: mocks.readCatalog,
  resolveEcotrackDeliveryFee: mocks.resolveFee,
}));
vi.mock('./reporting-refresh-trigger', () => ({
  triggerAdminReportingRefresh: mocks.reporting,
}));

import {
  AdminOrderHasActiveEcotrackShipmentError,
  AdminOrderLifecycleNotFoundError,
  createAdminOrder,
  deleteAdminOrder,
} from './admin-order-lifecycle';

const actor = { email: 'admin@example.com', name: 'Admin' };

describe('canonical admin order lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createToken.mockReturnValue('public-token');
    mocks.normalizePhone.mockReturnValue('213550123456');
    mocks.commercial.mockResolvedValue({
      cartProducts: ['12'],
      lines: [{ productId: 12 }],
      productSubtotal: 14_900,
    });
    mocks.readCatalog.mockResolvedValue({ serviceFees: [] });
    mocks.resolveFee.mockReturnValue(600);
    mocks.mutate.mockResolvedValue({ order: { id: 91 } });
    mocks.loadDetail.mockResolvedValue({
      id: 91,
      fullName: 'Ahmed Test',
      phoneNumber1: '0550123456',
      inHouseStatus: 0,
      ecotrackTrackingNumber: null,
      variant: null,
      totalAmount: 15_500,
    });
    mocks.reporting.mockResolvedValue({ kind: 'started' });
    mocks.activeShipment.mockResolvedValue(null);
  });

  it('creates canonical commercial snapshots and returns duplicate-phone evidence', async () => {
    const duplicateLimit = vi
      .fn()
      .mockResolvedValue([{ id: 88, createdAt: new Date('2026-08-24T07:00:00.000Z') }]);
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ orderBy: vi.fn(() => ({ limit: duplicateLimit })) })),
        })),
      })),
    };
    const now = new Date('2026-08-24T08:00:00.000Z');

    await expect(
      createAdminOrder(
        db as never,
        {
          firstName: 'Ahmed',
          lastName: 'Test',
          email: null,
          phoneNumber1: '0550123456',
          phoneNumber2: null,
          cartProducts: ['12'],
          delivery: 0,
          state: 16,
          city: 'Bab Ezzouar',
          homeAddress: '12 rue des Outils',
          note: null,
          promoCode: null,
          visitId: null,
          journeyId: null,
          sessionId: null,
        },
        actor,
        now,
      ),
    ).resolves.toMatchObject({
      item: { id: 91, totalAmount: 15_500 },
      duplicateCandidates: [{ id: 88, createdAt: '2026-08-24T07:00:00.000Z' }],
    });
    expect(mocks.commercial).toHaveBeenCalledWith(db, {
      cartProducts: ['12'],
      promoCode: null,
      now,
    });
    expect(mocks.mutate).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ entityType: 'orders', operation: 'create', actor }),
    );
    expect(mocks.reporting).toHaveBeenCalledWith('order-create');
  });

  it('deletes only an existing exact local order and refreshes reporting', async () => {
    const db = {
      query: { ecotrackOrderStates: { findFirst: mocks.activeShipment } },
      select: () => ({ from: () => ({ where: () => ({ for: async () => [{ id: 91 }] }) }) }),
      transaction: async (callback: (tx: unknown) => unknown) => callback(db),
    };
    await expect(deleteAdminOrder(db as never, 91, actor)).resolves.toMatchObject({
      id: 91,
      customerName: 'Ahmed Test',
      status: 0,
    });
    expect(mocks.mutate).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        entityId: 91,
        operation: 'delete',
        actor,
        isReversible: false,
      }),
    );
    expect(mocks.reporting).toHaveBeenCalledWith('order-delete');

    mocks.loadDetail.mockResolvedValueOnce(null);
    await expect(deleteAdminOrder(db as never, 404, actor)).rejects.toBeInstanceOf(
      AdminOrderLifecycleNotFoundError,
    );
  });

  it('refuses permanent local deletion while an EcoTrack shipment is active', async () => {
    const db = {
      query: { ecotrackOrderStates: { findFirst: mocks.activeShipment } },
      select: () => ({ from: () => ({ where: () => ({ for: async () => [{ id: 91 }] }) }) }),
      transaction: async (callback: (tx: unknown) => unknown) => callback(db),
    };
    mocks.activeShipment.mockResolvedValueOnce({ trackingNumber: 'TRK-91' });

    await expect(deleteAdminOrder(db as never, 91, actor)).rejects.toBeInstanceOf(
      AdminOrderHasActiveEcotrackShipmentError,
    );
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(mocks.reporting).not.toHaveBeenCalled();
  });
});
