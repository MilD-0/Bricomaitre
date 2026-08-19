import { describe, expect, it, vi } from 'vitest';

import {
  addCartItem,
  getCartItemCount,
  getCartSubtotal,
  readCart,
  removeCartItem,
  reconcileCartWithCatalog,
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

  it('revalidates price and availability and removes unavailable products', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            {
              id: 12,
              slug: 'new-desk-lamp',
              title: 'Updated lamp',
              price: '1750.00',
              inStock: true,
              availabilityStatus: 'in_stock',
              images: ['https://cdn.example.com/lamp.jpg'],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const result = await reconcileCartWithCatalog(
      [item, { ...item, productId: 13, token: 'gone' }],
      fetcher,
    );
    expect(result).toEqual({
      items: [
        expect.objectContaining({
          productId: 12,
          token: 'new-desk-lamp',
          title: 'Updated lamp',
          unitPrice: 1750,
        }),
      ],
      removedProductIds: [13],
      priceChangedProductIds: [12],
      changed: true,
      requiresReview: true,
    });
    expect(fetcher).toHaveBeenCalledWith(
      '/api/cart/validate',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('does not force a second checkout confirmation for non-commercial snapshot cleanup', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            {
              id: 12,
              slug: 'canonical-desk-lamp',
              title: 'Desk Lamp revised',
              price: '1500.00',
              inStock: true,
              availabilityStatus: 'in_stock',
              images: ['https://cdn.example.com/lamp.jpg'],
            },
          ],
        }),
        { status: 200 },
      ),
    );

    await expect(reconcileCartWithCatalog([item], fetcher)).resolves.toMatchObject({
      changed: true,
      requiresReview: false,
      removedProductIds: [],
      priceChangedProductIds: [],
      items: [expect.objectContaining({ token: 'canonical-desk-lamp', unitPrice: 1500 })],
    });
  });
});
