import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { buildShoppingListDraftRequest } from '../components/orders/orders-shopping-list';

import {
  buildGeneratedShoppingListDraft,
  buildShoppingListScopeKey,
  buildShoppingListInventoryPreview,
  reconcileShoppingListAllocations,
  mergeShoppingListDraft,
  shoppingListDraftSaveRequestSchema,
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

  it('retains legacy selection identities and hashes larger cohorts consistently in browser and server code', () => {
    const legacy = Array.from({ length: 500 }, (_, index) => 250000 + index);
    expect(buildShoppingListScopeKey('selected', legacy)).toBe(`selected:${legacy.join(',')}`);
    for (const count of [501, 1000, 10000]) {
      const ids = Array.from({ length: count }, (_, index) => 250000 + index);
      const expected = `selected:sha256:${createHash('sha256')
        .update(`selected:${ids.join(',')}`)
        .digest('hex')}`;
      const key = buildShoppingListScopeKey('selected', ids);
      expect(key).toBe(expected);
      expect(key.length).toBe(80);
      expect(buildShoppingListScopeKey('selected', [...ids].reverse().concat(ids[0]!))).toBe(key);
      expect(buildShoppingListScopeKey('selected', [...ids.slice(0, -1), 999999])).not.toBe(key);
    }
  });

  it('addresses status lists without putting the full cohort in the URL', () => {
    const ids = Array.from({ length: 681 }, (_, index) => 250000 + index);
    expect(buildShoppingListDraftRequest('posted-and-confirmed', ids).url).toBe(
      '/api/orders/shopping-list-draft?sourceMode=posted-and-confirmed',
    );
    expect(buildShoppingListDraftRequest('selected', [32, 31, 31]).url).toBe(
      '/api/orders/shopping-list-draft?sourceMode=selected&orderIds=31&orderIds=32',
    );
  });

  it('transports large selections in validated bodies for lookup and reset, retaining every ID', () => {
    const ids = Array.from({ length: 10000 }, (_, index) => 250000 + index);
    for (const revision of [undefined, 3]) {
      const { url, init } = buildShoppingListDraftRequest('selected', [...ids].reverse(), revision);
      expect(url).toBe('/api/orders/shopping-list-draft');
      expect(init?.method).toBe(revision === undefined ? 'POST' : 'DELETE');
      expect(JSON.parse(String(init?.body))).toEqual({
        sourceMode: 'selected',
        orderIds: ids,
        ...(revision === undefined ? {} : { revision }),
      });
    }
    expect(buildShoppingListDraftRequest('selected', [32, 31], 3)).toEqual({
      url: '/api/orders/shopping-list-draft?sourceMode=selected&orderIds=31&orderIds=32&revision=3',
      init: { method: 'DELETE' },
    });
  });

  it('preserves a large cohort through generation and the save contract', async () => {
    const draft = await buildGeneratedShoppingListDraft({
      orders: Array.from({ length: 681 }, (_, index) => ({
        id: index + 1,
        fullName: `Customer ${index}`,
        note: null,
        orderProducts: [orderProduct({ productId: index + 1 })],
      })),
      sourceMode: 'posted-and-confirmed',
      title: 'Combined shopping list',
      resolveProductDetails: async () => ({ inventoryQuantity: 3, purchasePrice: 100 }),
      resolveBrandName: async () => 'Bosch',
    });
    const saved = shoppingListDraftSaveRequestSchema.parse({ ...draft, revision: null });
    expect(saved.generatedItems).toHaveLength(681);
    expect(saved.draftItems).toHaveLength(681);
    expect(saved.orders).toHaveLength(681);
    expect(saved.orderIds).toHaveLength(681);
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
