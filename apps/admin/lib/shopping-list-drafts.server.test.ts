import { describe, expect, it, vi } from 'vitest';

import {
  saveAdminShoppingListDraft,
  ShoppingListDraftConflictError,
} from './shopping-list-drafts.server';

vi.mock('./shopping-list-stock-allocations', () => ({
  initializeLegacyShoppingListAllocations: vi.fn(),
  hydrateShoppingListStockCredits: vi.fn(async (_db, draft) => draft),
}));

import { buildGeneratedShoppingListDraft } from './shopping-list-drafts';
import { hydrateShoppingListStockCredits } from './shopping-list-stock-allocations';

const payload = {
  sourceMode: 'selected' as const,
  orderIds: [32, 31, 31],
  title: 'Supplier run',
  draftItems: [],
  generatedItems: [],
  orders: [],
};

function row(revision: number) {
  return {
    id: 1,
    scopeKey: 'selected:31,32',
    revision,
    ...payload,
    orderIds: [31, 32],
    ordersSnapshot: [],
    createdBy: 'admin@example.com',
    createdByName: 'Admin',
    updatedBy: 'admin@example.com',
    updatedByName: 'Admin',
    createdAt: new Date('2026-09-04T00:00:00.000Z'),
    updatedAt: new Date('2026-09-04T00:00:00.000Z'),
  };
}

describe('shopping-list draft optimistic concurrency', () => {
  it('creates a new scope only when no draft already exists', async () => {
    const returning = vi.fn().mockResolvedValue([row(0)]);
    const onConflictDoNothing = vi.fn(() => ({ returning }));
    const values = vi.fn(() => ({ onConflictDoNothing }));
    const db = {
      insert: vi.fn(() => ({ values })),
      select: vi.fn(() => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) })),
      transaction: vi.fn(),
    };
    db.transaction.mockImplementation(async (fn) => fn(db));

    await expect(
      saveAdminShoppingListDraft(
        db as never,
        { ...payload, revision: null },
        { email: 'admin@example.com', name: 'Admin' },
        new Date('2026-09-04T00:00:00.000Z'),
      ),
    ).resolves.toMatchObject({ scopeKey: 'selected:31,32', revision: 0 });
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ scopeKey: 'selected:31,32', orderIds: [31, 32] }),
    );
    expect(onConflictDoNothing).toHaveBeenCalledWith(expect.any(Object));
  });

  it('increments the exact current revision and rejects stale saves', async () => {
    const returning = vi
      .fn()
      .mockResolvedValueOnce([row(4)])
      .mockResolvedValueOnce([]);
    const where = vi.fn(() => ({ returning }));
    const set = vi.fn(() => ({ where }));
    const db = {
      transaction: vi.fn(),
      select: vi.fn(() => ({ from: () => ({ where: () => ({ limit: async () => [row(3)] }) }) })),
      update: vi.fn(() => ({ set })),
    };
    db.transaction.mockImplementation(async (fn) => fn(db));

    await expect(
      saveAdminShoppingListDraft(db as never, { ...payload, revision: 3 }),
    ).resolves.toMatchObject({ revision: 4 });
    await expect(
      saveAdminShoppingListDraft(db as never, { ...payload, revision: 3 }),
    ).rejects.toBeInstanceOf(ShoppingListDraftConflictError);
    expect(where).toHaveBeenCalledTimes(2);
  });

  it('rebases departed order credits before saving the replacement cohort proposal', async () => {
    const draft = await buildGeneratedShoppingListDraft({
      sourceMode: 'posted',
      title: 'Posted',
      orders: [
        {
          id: 31,
          fullName: 'Order 31',
          note: null,
          orderProducts: [
            {
              productId: 12,
              rawValue: '12',
              title: 'Drill',
              quantity: 2,
              unitPrice: 10,
              lineTotal: 20,
              thumbnailUrl: null,
              missing: false,
            },
          ],
        },
      ],
      resolveProductDetails: async () => ({ inventoryQuantity: 48, purchasePrice: null }),
      resolveBrandName: async () => 'Unbranded',
    });
    const saved = {
      ...row(3),
      ...draft,
      scopeKey: 'status:posted',
      generatedItems: draft.generatedItems.map((item) => ({
        ...item,
        inventoryAppliedQuantity: 2,
        inventoryOrderAppliedQuantity: 2,
      })),
      draftItems: draft.draftItems.map((item) => ({
        ...item,
        inventoryAppliedQuantity: 2,
        inventoryDecreaseQuantity: 0,
      })),
      ordersSnapshot: draft.orders,
    };
    const returning = vi.fn().mockResolvedValue([{ ...saved, revision: 4 }]);
    const set = vi.fn(() => ({ where: () => ({ returning }) }));
    const db = {
      transaction: vi.fn(),
      select: vi.fn(() => ({ from: () => ({ where: () => ({ limit: async () => [saved] }) }) })),
      update: vi.fn(() => ({ set })),
    };
    db.transaction.mockImplementation(async (fn) => fn(db));
    vi.mocked(hydrateShoppingListStockCredits)
      .mockImplementationOnce(async (_db, value) => value)
      .mockImplementationOnce(async (_db, value) => {
        expect(value.orderIds).toEqual([32]);
        expect(value.orders.map((order) => order.orderId)).toEqual([32]);
        return {
          ...value,
          generatedItems: value.generatedItems.map((item) => ({
            ...item,
            inventoryAppliedQuantity: 0,
            inventoryOrderAppliedQuantity: 0,
          })),
          draftItems: value.draftItems.map((item) => ({ ...item, inventoryAppliedQuantity: 0 })),
        };
      });
    await saveAdminShoppingListDraft(db as never, {
      ...draft,
      revision: 3,
      orderIds: [32],
      orders: draft.orders.map((order) => ({ ...order, orderId: 32 })),
    });
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        orderIds: [32],
        draftItems: [
          expect.objectContaining({ inventoryAppliedQuantity: 0, inventoryDecreaseQuantity: 2 }),
        ],
      }),
    );
    Object.assign(saved.generatedItems[0]!, { inventoryLegacyAppliedQuantity: 2 });
    await expect(
      saveAdminShoppingListDraft(db as never, {
        ...draft,
        revision: 3,
        orderIds: [32],
        orders: draft.orders.map((order) => ({ ...order, orderId: 32 })),
      }),
    ).rejects.toThrow('Review previous stock deductions');
    expect(set).toHaveBeenCalledTimes(1);
  });
});
