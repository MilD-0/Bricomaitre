import { describe, expect, it, vi } from 'vitest';

import {
  buildGeneratedShoppingListDraft,
  buildShoppingListInventoryPreview,
  reconcileShoppingListAllocations,
  mergeShoppingListDraft,
} from './shopping-list-drafts';

function orderProduct(overrides: Record<string, unknown> = {}) {
  return {
    productId: 12,
    brandId: 2,
    rawValue: '12',
    title: 'Perceuse Bosch 18 V',
    unitPrice: 15_000,
    quantity: 1,
    lineTotal: 15_000,
    thumbnailUrl: 'https://cdn.example.com/drill.jpg',
    missing: false,
    ...overrides,
  };
}

describe('shopping-list draft generation', () => {
  it('aggregates the complete order cohort and recomputes live inventory coverage', async () => {
    const resolveProductDetails = vi.fn(async (productId: number) =>
      productId === 12 ? { inventoryQuantity: 3, purchasePrice: 9_000 } : null,
    );
    const resolveBrandName = vi.fn(async (brandId: number | null) =>
      brandId === 2 ? 'Bosch' : 'Unbranded',
    );

    const draft = await buildGeneratedShoppingListDraft({
      orders: [
        {
          id: 32,
          fullName: 'Ada Lovelace',
          note: 'Fragile',
          orderProducts: [orderProduct({ quantity: 2, lineTotal: 30_000 })],
        },
        {
          id: 31,
          fullName: 'Grace Hopper',
          note: 'Fragile',
          orderProducts: [
            orderProduct({ quantity: 2, lineTotal: 30_000 }),
            orderProduct({
              productId: null,
              brandId: null,
              rawValue: 'legacy-hammer',
              title: 'Ancien marteau',
              unitPrice: 2_000,
              quantity: 2,
              lineTotal: 4_000,
              thumbnailUrl: null,
              missing: true,
            }),
          ],
        },
      ],
      sourceMode: 'confirmed',
      title: 'Confirmed shopping list',
      generatedAt: '2026-08-24T10:00:00.000Z',
      resolveProductDetails,
      resolveBrandName,
    });

    expect(draft.orderIds).toEqual([31, 32]);
    expect(draft.orders).toHaveLength(2);
    expect(draft.generatedItems).toHaveLength(2);
    expect(draft.generatedItems).toContainEqual(
      expect.objectContaining({
        productId: 12,
        quantity: 4,
        purchasePrice: 9_000,
        inventoryQuantity: 3,
        inventoryDecreaseQuantity: 3,
        inventoryShortageQuantity: 1,
        inventoryActionEligible: true,
        notes: ['Fragile'],
      }),
    );
    expect(draft.generatedItems).toContainEqual(
      expect.objectContaining({
        productId: null,
        quantity: 2,
        inventoryQuantity: null,
        inventoryDecreaseQuantity: 0,
        inventoryShortageQuantity: 2,
        inventoryActionEligible: false,
      }),
    );
    expect(resolveProductDetails).toHaveBeenCalledTimes(1);
    expect(resolveProductDetails).toHaveBeenCalledWith(12);
    expect(resolveBrandName).toHaveBeenCalledTimes(2);
    expect(draft.draftItems).not.toBe(draft.generatedItems);
  });

  it('only deducts units that have not already been applied, including quantity edits', () => {
    expect(buildShoppingListInventoryPreview(2, 71, 2)).toMatchObject({
      inventoryDecreaseQuantity: 0,
      inventoryShortageQuantity: 0,
      inventoryActionEligible: false,
    });
    expect(buildShoppingListInventoryPreview(5, 1, 2)).toMatchObject({
      inventoryDecreaseQuantity: 1,
      inventoryShortageQuantity: 2,
      inventoryAppliedQuantity: 2,
    });
    expect(buildShoppingListInventoryPreview(1, 71, 2).inventoryDecreaseQuantity).toBe(0);
  });

  it('ignores forged allocation counters on a custom editable line without a generated counterpart', async () => {
    const draft = await buildGeneratedShoppingListDraft({
      orders: [{ id: 31, fullName: 'Audit', note: null, orderProducts: [orderProduct()] }],
      sourceMode: 'selected',
      title: 'Audit',
      resolveProductDetails: async () => ({ inventoryQuantity: 10, purchasePrice: null }),
      resolveBrandName: async () => 'Bosch',
    });
    const reconciled = reconcileShoppingListAllocations(
      {
        ...draft,
        generatedItems: [],
        draftItems: draft.draftItems.map((item) => ({
          ...item,
          isCustom: true,
          inventoryAppliedQuantity: 9,
          inventoryManualAppliedQuantity: 9,
          inventoryOrderAppliedQuantity: 9,
          inventoryLegacyAppliedQuantity: 9,
        })),
      },
      { generatedItems: [], draftItems: [] },
    );
    expect(reconciled.draftItems[0]).toMatchObject({
      inventoryAppliedQuantity: 0,
      inventoryManualAppliedQuantity: undefined,
      inventoryOrderAppliedQuantity: undefined,
      inventoryLegacyAppliedQuantity: undefined,
    });
  });

  it('never invents inventory coverage when the catalog quantity is unavailable', () => {
    expect(buildShoppingListInventoryPreview(4, null)).toEqual({
      inventoryDecreaseQuantity: 0,
      inventoryShortageQuantity: 4,
      inventoryAppliedQuantity: 0,
      inventoryActionEligible: false,
    });
  });
});

describe('shopping-list refresh', () => {
  async function build(ids: number[], quantity = 2) {
    return buildGeneratedShoppingListDraft({
      sourceMode: 'posted',
      title: 'Posted list',
      orders: ids.map((id) => ({
        id,
        fullName: `Order ${id}`,
        note: null,
        orderProducts: [orderProduct({ quantity })],
      })),
      resolveProductDetails: async () => ({ inventoryQuantity: 48, purchasePrice: null }),
      resolveBrandName: async () => 'Bosch',
    });
  }
  async function consumed() {
    const saved = await build([1]);
    saved.generatedItems[0]!.inventoryAppliedQuantity = 2;
    saved.generatedItems[0]!.inventoryOrderAppliedQuantity = 2;
    saved.draftItems[0]!.inventoryAppliedQuantity = 2;
    saved.draftItems[0]!.inventoryDecreaseQuantity = 0;
    return saved;
  }

  it('adds a new order for an already consumed product and proposes only its remaining units', async () => {
    const refreshed = mergeShoppingListDraft(await build([1, 2]), await consumed());
    expect(refreshed.draftItems[0]).toMatchObject({
      quantity: 4,
      inventoryAppliedQuantity: 2,
      inventoryDecreaseQuantity: 2,
    });
    expect(refreshed.orders.map((order) => order.orderId)).toEqual([1, 2]);
  });

  it('keeps manual quantity additions when demand grows and does not add them twice on another refresh', async () => {
    const saved = await consumed();
    saved.draftItems[0]!.quantity = 5;
    const refreshed = mergeShoppingListDraft(await build([1, 2]), saved);
    expect(refreshed.draftItems[0]!.quantity).toBe(7);
    expect(mergeShoppingListDraft(await build([1, 2]), refreshed).draftItems[0]!.quantity).toBe(7);
  });

  it('replaces departed orders even when their replacement has the same product total', async () => {
    const refreshed = mergeShoppingListDraft(await build([2]), await consumed());
    expect(refreshed.orders.map((order) => order.orderId)).toEqual([2]);
    expect(refreshed.draftItems[0]).toMatchObject({
      quantity: 2,
      inventoryAppliedQuantity: 0,
      inventoryDecreaseQuantity: 2,
    });
  });

  it('keeps an explicitly removed product removed while retaining its durable credit', async () => {
    const saved = await consumed();
    saved.draftItems = [];
    const refreshed = mergeShoppingListDraft(await build([1, 2]), saved);
    expect(refreshed.draftItems).toEqual([]);
    expect(refreshed.generatedItems[0]!.inventoryAppliedQuantity).toBe(2);
  });

  it('removes departed demand but preserves manual extras and their applied credit', async () => {
    const saved = await consumed();
    saved.draftItems[0]!.quantity = 5;
    saved.generatedItems[0]!.inventoryManualAppliedQuantity = 1;
    saved.generatedItems[0]!.inventoryAppliedQuantity = 3;
    const refreshed = mergeShoppingListDraft(await build([]), saved);
    expect(refreshed.orderIds).toEqual([]);
    expect(refreshed.orders).toEqual([]);
    expect(refreshed.draftItems[0]).toMatchObject({
      quantity: 3,
      isCustom: true,
      inventoryAppliedQuantity: 1,
      inventoryDecreaseQuantity: 2,
    });
    expect(refreshed.generatedItems[0]).toMatchObject({
      inventoryLedgerOnly: true,
      inventoryManualAppliedQuantity: 1,
    });
  });

  it('keeps manual reductions and distributes refreshed demand across duplicate lines', async () => {
    const saved = await build([1], 4);
    saved.draftItems = [
      { ...saved.draftItems[0]!, draftId: 'first', quantity: 1 },
      { ...saved.draftItems[0]!, draftId: 'second', quantity: 2 },
    ];
    const refreshed = mergeShoppingListDraft(await build([1], 2), saved);
    expect(refreshed.draftItems.map((item) => item.quantity)).toEqual([1]);
    expect(mergeShoppingListDraft(await build([1], 1), refreshed).draftItems).toEqual([]);
  });
});
