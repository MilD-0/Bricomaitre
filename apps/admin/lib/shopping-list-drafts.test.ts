import { describe, expect, it, vi } from 'vitest';

import {
  buildGeneratedShoppingListDraft,
  buildShoppingListInventoryPreview,
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

  it('never invents inventory coverage when the catalog quantity is unavailable', () => {
    expect(buildShoppingListInventoryPreview(4, null)).toEqual({
      inventoryDecreaseQuantity: 0,
      inventoryShortageQuantity: 4,
      inventoryAppliedQuantity: 0,
      inventoryActionEligible: false,
    });
  });
});
