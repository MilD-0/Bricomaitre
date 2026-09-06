import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  delete: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({ getDb: () => 'database' }));
vi.mock('./admin-order-update', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./admin-order-update')>()),
  updateAdminOrder: mocks.update,
}));
vi.mock('./admin-order-lifecycle', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./admin-order-lifecycle')>()),
  createAdminOrder: mocks.create,
  deleteAdminOrder: mocks.delete,
}));

import {
  adminAiOrderDetailsMutationSchema,
  adminAiOrderDetailsMutationFromTool,
  adminAiOrderDetailsToolSchema,
  adminAiOrderStatusMutationSchema,
  createAdminAiOrder,
  deleteAdminAiOrders,
  updateAdminOrderDetails,
  updateAdminOrderDetailsFromTool,
  updateAdminOrderStatuses,
} from './admin-ai-orders';
import { AdminOrderNotFoundError } from './admin-order-update';
import {
  AdminOrderHasActiveEcotrackShipmentError,
  AdminOrderLifecycleNotFoundError,
} from './admin-order-lifecycle';

function order(inHouseStatus: number, history: number[], noAnswerCount = 0) {
  return {
    inHouseStatus,
    noAnswerCount,
    statusHistory: history.map((status, index) => ({ id: index + 1, status })),
  };
}

describe('admin AI order status updates', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses semantic statuses while executing the canonical order workflow with actor history', async () => {
    mocks.update.mockResolvedValueOnce(order(2, [0, 2]));
    await expect(
      updateAdminOrderStatuses(
        { items: [{ orderId: 91, status: 'confirmed' }] },
        { email: 'admin@example.com', name: 'Admin' },
      ),
    ).resolves.toEqual({
      ok: true,
      items: [
        {
          orderId: 91,
          previousStatus: 0,
          status: 2,
          statusLabel: 'confirmed',
          noAnswerCount: 0,
        },
      ],
      skipped: [],
      failed: [],
    });
    expect(mocks.update).toHaveBeenCalledWith(
      'database',
      91,
      { inHouseStatus: 2 },
      { email: 'admin@example.com', name: 'Admin' },
      { allowStatusCorrection: true },
    );
  });

  it('requires an exact counter for no-answer updates', () => {
    expect(
      adminAiOrderStatusMutationSchema.safeParse({
        items: [{ orderId: 91, status: 'no_answer' }],
      }).success,
    ).toBe(false);
    expect(
      adminAiOrderStatusMutationSchema.safeParse({
        items: [{ orderId: 91, status: 'no_answer', noAnswerCount: 2 }],
      }).success,
    ).toBe(true);
  });

  it('reports missing rows without hiding successful explicit corrections', async () => {
    mocks.update
      .mockResolvedValueOnce(order(6, [0, 6]))
      .mockRejectedValueOnce(new AdminOrderNotFoundError(92))
      .mockResolvedValueOnce(order(2, [8, 2]));
    await expect(
      updateAdminOrderStatuses({
        items: [
          { orderId: 91, status: 'cancelled' },
          { orderId: 92, status: 'confirmed' },
          { orderId: 93, status: 'confirmed' },
        ],
      }),
    ).resolves.toEqual({
      ok: false,
      items: [
        {
          orderId: 91,
          previousStatus: 0,
          status: 6,
          statusLabel: 'cancelled',
          noAnswerCount: 0,
        },
        {
          orderId: 93,
          previousStatus: 8,
          status: 2,
          statusLabel: 'confirmed',
          noAnswerCount: 0,
        },
      ],
      skipped: [{ orderId: 92, reason: 'missing' }],
      failed: [],
    });
  });

  it('retains committed status receipts and continues after an unresolved carrier conflict', async () => {
    const conflict = new Error('Open carrier recovery before editing this order.');
    conflict.name = 'EcotrackMutationConflictError';
    mocks.update
      .mockResolvedValueOnce(order(2, [0, 2]))
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce(order(6, [0, 6]));
    const result = await updateAdminOrderStatuses({
      items: [
        { orderId: 91, status: 'confirmed' },
        { orderId: 92, status: 'confirmed' },
        { orderId: 93, status: 'cancelled' },
      ],
    });
    expect(result).toMatchObject({
      ok: false,
      items: [
        { orderId: 91, status: 2 },
        { orderId: 93, status: 6 },
      ],
      skipped: [],
      failed: [{ orderId: 92, code: 'EcotrackMutationConflictError', message: conflict.message }],
    });
    expect(mocks.update).toHaveBeenCalledTimes(3);
  });

  it('updates customer, delivery, note, and line details through the canonical workflow', async () => {
    const updated = {
      ...order(2, [0, 2]),
      id: 91,
      firstName: 'Samir',
      city: 'Bab Ezzouar',
      delivery: 0,
      totalAmount: 16_100,
    };
    mocks.update.mockResolvedValueOnce(updated);

    await expect(
      updateAdminOrderDetails(
        {
          items: [
            {
              orderId: 91,
              changes: {
                firstName: ' Samir ',
                phoneNumber: '0550000000',
                note: 'Call after 17:00',
                delivery: 'home',
                wilayaId: 16,
                commune: 'Bab Ezzouar',
                homeAddress: '12 rue des Outils',
                cartProductTokens: ['12', '12', '18'],
              },
            },
          ],
        },
        { email: 'admin@example.com', name: 'Admin' },
      ),
    ).resolves.toEqual({ ok: true, updatedCount: 1, items: [updated], failed: [] });
    expect(mocks.update).toHaveBeenCalledWith(
      'database',
      91,
      {
        firstName: 'Samir',
        lastName: undefined,
        phoneNumber1: '0550000000',
        note: 'Call after 17:00',
        delivery: 0,
        state: 16,
        city: 'Bab Ezzouar',
        homeAddress: '12 rue des Outils',
        cartProducts: ['12', '12', '18'],
      },
      { email: 'admin@example.com', name: 'Admin' },
    );
  });

  it('bounds detail edits and reports exact per-order failures', async () => {
    expect(
      adminAiOrderDetailsMutationSchema.safeParse({
        items: [{ orderId: 91, changes: {} }],
      }).success,
    ).toBe(false);
    expect(
      adminAiOrderDetailsMutationSchema.safeParse({
        items: [{ orderId: 91, changes: { inHouseStatus: 2 } }],
      }).success,
    ).toBe(false);

    mocks.update
      .mockRejectedValueOnce(new AdminOrderNotFoundError(91))
      .mockResolvedValueOnce({ ...order(0, [0]), id: 92, note: 'Verified' });
    await expect(
      updateAdminOrderDetails({
        items: [
          { orderId: 91, changes: { note: 'Missing' } },
          { orderId: 92, changes: { note: 'Verified' } },
        ],
      }),
    ).resolves.toMatchObject({
      ok: false,
      updatedCount: 1,
      items: [{ id: 92, note: 'Verified' }],
      failed: [{ orderId: 91, error: 'Order 91 was not found.' }],
    });
  });

  it('converts explicit field operations without exposing unrelated patch properties', () => {
    expect(
      adminAiOrderDetailsMutationFromTool({
        items: [
          {
            orderId: 92,
            operations: [
              { field: 'wilayaId', value: 16 },
              { field: 'commune', value: 'Bab Ezzouar' },
            ],
          },
        ],
      }),
    ).toEqual({
      items: [{ orderId: 92, changes: { wilayaId: 16, commune: 'Bab Ezzouar' } }],
    });
    expect(
      adminAiOrderDetailsToolSchema.safeParse({
        items: [
          {
            orderId: 92,
            operations: [{ field: 'wilayaId', value: 16, phoneNumber: 'PRESERVE' }],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      adminAiOrderDetailsToolSchema.safeParse({
        items: [
          {
            orderId: 92,
            operations: [
              { field: 'commune', value: 'Bab Ezzouar' },
              { field: 'commune', value: 'Alger Centre' },
            ],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('executes operation patches through the canonical order update workflow', async () => {
    mocks.update.mockResolvedValueOnce({ ...order(2, [0, 2]), id: 92, city: 'Bab Ezzouar' });

    await expect(
      updateAdminOrderDetailsFromTool({
        items: [
          {
            orderId: 92,
            operations: [
              { field: 'wilayaId', value: 16 },
              { field: 'commune', value: 'Bab Ezzouar' },
            ],
          },
        ],
      }),
    ).resolves.toMatchObject({ ok: true, updatedCount: 1, failed: [] });
    expect(mocks.update).toHaveBeenCalledWith(
      'database',
      92,
      {
        firstName: undefined,
        lastName: undefined,
        phoneNumber1: undefined,
        note: undefined,
        delivery: undefined,
        state: 16,
        city: 'Bab Ezzouar',
        homeAddress: undefined,
        cartProducts: undefined,
      },
      undefined,
    );
  });
});

describe('admin AI order lifecycle', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates one canonical local order from exact product IDs without inventing optional fields', async () => {
    mocks.create.mockResolvedValue({
      item: { id: 91, variant: null, totalAmount: 15_500 },
      duplicateCandidates: [{ id: 88, createdAt: '2026-08-24T07:00:00.000Z' }],
    });
    const actor = { email: 'admin@example.com', name: 'Admin' };
    await expect(
      createAdminAiOrder(
        {
          firstName: 'Ahmed',
          lastName: null,
          email: null,
          phoneNumber1: '0550123456',
          phoneNumber2: null,
          productIds: [12, 12],
          delivery: 'home',
          wilayaId: 16,
          commune: 'Bab Ezzouar',
          homeAddress: '12 rue des Outils',
          note: null,
          promoCode: null,
        },
        actor,
      ),
    ).resolves.toMatchObject({ ok: true, item: { id: 91 }, duplicateCandidates: [{ id: 88 }] });
    expect(mocks.create).toHaveBeenCalledWith(
      'database',
      {
        firstName: 'Ahmed',
        lastName: null,
        email: null,
        phoneNumber1: '0550123456',
        phoneNumber2: null,
        cartProducts: ['12', '12'],
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
    );
  });

  it('does not create an assistant order without a resolved catalog product', async () => {
    await expect(
      createAdminAiOrder({
        firstName: 'Ahmed',
        lastName: null,
        email: null,
        phoneNumber1: '0550123456',
        phoneNumber2: null,
        productIds: [],
        delivery: 'home',
        wilayaId: null,
        commune: null,
        homeAddress: null,
        note: null,
        promoCode: null,
      }),
    ).rejects.toThrow();

    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('deletes only local orders without active EcoTrack shipments', async () => {
    mocks.delete
      .mockResolvedValueOnce({
        id: 91,
        customerName: 'Ahmed Test',
        status: 2,
      })
      .mockRejectedValueOnce(new AdminOrderLifecycleNotFoundError(99))
      .mockRejectedValueOnce(new AdminOrderHasActiveEcotrackShipmentError(92, 'TRK-92'));

    await expect(deleteAdminAiOrders({ orderIds: [91, 99, 92] })).resolves.toMatchObject({
      ok: false,
      deletedCount: 1,
      failedCount: 2,
      deleted: [{ id: 91 }],
      failed: [
        { orderId: 99, code: 'order_not_found' },
        { orderId: 92, code: 'active_ecotrack_shipment' },
      ],
    });
  });
});
