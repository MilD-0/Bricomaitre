import type { ShoppingAssistantCartMutation } from '@bric/storefront-core/shopping-assistant-contracts';
import { describe, expect, it } from 'vitest';

import type { CartItem } from './cart';
import { applyShoppingAssistantCartMutations } from './shopping-assistant-cart';

function mutation(
  action: ShoppingAssistantCartMutation['action'],
  quantity: number,
  overrides: Partial<ShoppingAssistantCartMutation['product']> = {},
): ShoppingAssistantCartMutation {
  return {
    action,
    quantity,
    product: {
      id: 12,
      token: 'perceuse-beton',
      title: 'Perceuse béton',
      titleAr: 'مثقاب خرسانة',
      description: null,
      descriptionAr: null,
      sku: null,
      characteristics: [],
      characteristicsAr: [],
      price: '12500.00',
      oldPrice: null,
      inStock: true,
      availabilityStatus: 'in_stock',
      imageUrl: null,
      brand: null,
      category: null,
      ...overrides,
    },
  };
}

const existing: CartItem = {
  productId: 12,
  token: 'perceuse-beton',
  title: 'Perceuse béton',
  imageUrl: null,
  unitPrice: 12_500,
  quantity: 2,
  availabilityStatus: 'in_stock',
};

describe('shopping assistant cart mutations', () => {
  it('applies sequential add, exact quantity, and remove operations to the native cart', () => {
    const result = applyShoppingAssistantCartMutations(
      [existing],
      [mutation('add', 2), mutation('set_quantity', 7), mutation('remove', 0)],
      'fr',
    );

    expect(result.items).toEqual([]);
    expect(
      result.changes.map(({ previousQuantity, resultingQuantity }) => ({
        previousQuantity,
        resultingQuantity,
      })),
    ).toEqual([
      { previousQuantity: 2, resultingQuantity: 4 },
      { previousQuantity: 4, resultingQuantity: 7 },
      { previousQuantity: 7, resultingQuantity: 0 },
    ]);
  });

  it('adds a grounded Arabic product and honors the cart quantity ceiling', () => {
    const result = applyShoppingAssistantCartMutations(
      [{ ...existing, quantity: 19 }],
      [mutation('add', 4)],
      'ar',
    );

    expect(result.items[0]).toMatchObject({ quantity: 20, title: 'مثقاب خرسانة' });
    expect(result.changes[0]).toMatchObject({ previousQuantity: 19, resultingQuantity: 20 });
  });

  it('ignores unavailable additions and cart-only operations for absent products', () => {
    const result = applyShoppingAssistantCartMutations(
      [],
      [mutation('add', 1, { inStock: false }), mutation('set_quantity', 3), mutation('remove', 0)],
      'fr',
    );

    expect(result).toEqual({ items: [], changes: [], changed: false });
  });
});
