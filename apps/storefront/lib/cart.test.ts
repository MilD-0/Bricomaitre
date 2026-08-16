import { describe, expect, it, vi } from 'vitest';

import {
  addCartItem,
  getCartItemCount,
  getCartSubtotal,
  readCart,
  removeCartItem,
  STOREFRONT_CART_KEY,
  updateCartItemQuantity,
  writeCart,
} from './cart';

const item = {
  productId: 12,
  token: 'desk-lamp',
  title: 'Desk Lamp',
  imageUrl: null,
  unitPrice: 1500,
  quantity: 2,
  availabilityStatus: 'in_stock',
};

describe('storefront cart boundary', () => {
  it('adds and merges validated product snapshots with a quantity ceiling', () => {
    expect(addCartItem([], item)).toEqual([item]);
    expect(addCartItem([{ ...item, quantity: 19 }], { ...item, quantity: 3 })[0]).toMatchObject({
      quantity: 20,
    });
  });

  it('updates, totals, and removes cart items without exceeding quantity bounds', () => {
    const cart = [{ ...item, quantity: 2 }];
    const updated = updateCartItemQuantity(cart, item.productId, 99);
    expect(updated[0]?.quantity).toBe(20);
    expect(getCartItemCount(updated)).toBe(20);
    expect(getCartSubtotal(updated)).toBe(item.unitPrice * 20);
    expect(removeCartItem(updated, item.productId)).toEqual([]);
  });

  it('recovers from malformed browser storage and writes only valid carts', () => {
    expect(readCart({ getItem: () => '{broken' })).toEqual([]);
    const setItem = vi.fn();
    writeCart({ setItem }, [item]);
    expect(setItem).toHaveBeenCalledWith(STOREFRONT_CART_KEY, JSON.stringify([item]));
  });
});
