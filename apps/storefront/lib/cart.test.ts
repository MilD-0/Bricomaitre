import { describe, expect, it, vi } from 'vitest';
import { CHECKOUT_REQUEST_TIMEOUT_MS } from './checkout-request';

import {
  addCartItem,
  mergeCartValidation,
  consumeOrderedCartItems,
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
  it('merges refreshed quotes without erasing concurrent quantities, offers, additions or removals', () => {
    const refreshed = { ...item, unitPrice: 1700 };
    const other = { ...item, productId: 90 };
    expect(mergeCartValidation([{ ...item, quantity: 3 }, other], [item], [refreshed])).toEqual([
      { ...refreshed, quantity: 3 },
      other,
    ]);
    expect(mergeCartValidation([], [item], [refreshed])).toEqual([]);
    const newOffer = { ...item, promoCode: 'NEW', unitPrice: 1000 };
    expect(mergeCartValidation([newOffer], [item], [refreshed])).toEqual([newOffer]);
    expect(mergeCartValidation([item, other], [item], [])).toEqual([other]);
  });

  it.each([false, true])(
    'preserves each active product offer regardless of insertion order: reversed=%s',
    async (reverse) => {
      const cart = [
        { ...item, quantity: 1, promoCode: 'A', unitPrice: 800 },
        { ...item, productId: 13, quantity: 1, promoCode: 'B', unitPrice: 1500 },
      ];
      if (reverse) cart.reverse();
      const fetcher = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            items: [12, 13].map((id) => ({
              id,
              slug: item.token,
              title: item.title,
              price: id === 12 ? '1000' : '2000',
              inStock: true,
              availabilityStatus: 'in_stock',
              images: [],
            })),
            promos: [
              { productId: 12, code: 'A', promoPrice: 800 },
              { productId: 13, code: 'B', promoPrice: 1500 },
            ],
          }),
        ),
      );
      const result = await reconcileCartWithCatalog(cart, fetcher);
      expect(getCartSubtotal(result.items)).toBe(2300);
      expect(result.requiresReview).toBe(false);
      expect(JSON.parse(fetcher.mock.calls[0][1].body).productPromos).toHaveLength(2);
    },
  );

  it('consumes only the accepted order quantities, preserving later additions and unrelated products', () => {
    const later = { ...item, productId: 99, quantity: 4 };
    expect(
      consumeOrderedCartItems([{ ...item, quantity: 5 }, later], [{ productId: 12, quantity: 2 }]),
    ).toEqual([{ ...item, quantity: 3 }, later]);
    expect(consumeOrderedCartItems([item, later], [{ productId: 12, quantity: 2 }])).toEqual([
      later,
    ]);
  });
  it('keeps a live promotional price and requires review when it expires', async () => {
    const product = {
      id: 12,
      slug: item.token,
      title: item.title,
      titleAr: 'مصباح',
      price: '1500',
      inStock: true,
      availabilityStatus: 'in_stock',
      images: [],
    };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [product],
            promo: { code: 'AUDIT10', productId: 12, promoPrice: 1200 },
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [product], promo: null })));
    const discounted = { ...item, promoCode: 'AUDIT10', unitPrice: 1200 };
    const active = await reconcileCartWithCatalog([discounted], fetcher, 'ar');
    expect(active.items[0]).toMatchObject({
      title: 'مصباح',
      unitPrice: 1200,
      promoCode: 'AUDIT10',
    });
    expect(active.requiresReview).toBe(false);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({
      productPromos: [{ productId: 12, code: 'AUDIT10' }],
    });
    const expired = await reconcileCartWithCatalog(active.items, fetcher, 'ar');
    expect(expired.items[0]).toMatchObject({ unitPrice: 1500, promoCode: null });
    expect(expired.requiresReview).toBe(true);
  });
  it.each(['headers', 'body'])(
    'times out a stalled cart validation response at %s',
    async (phase) => {
      vi.useFakeTimers();
      try {
        const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
          const stalled = () =>
            new Promise<never>((_resolve, reject) => {
              init!.signal!.addEventListener('abort', () =>
                reject(new DOMException('Timed out', 'AbortError')),
              );
            });
          if (phase === 'headers') return stalled();
          return { ok: true, json: stalled } as unknown as Response;
        });
        const assertion = expect(reconcileCartWithCatalog([item], fetcher)).rejects.toMatchObject({
          name: 'AbortError',
        });
        await vi.advanceTimersByTimeAsync(CHECKOUT_REQUEST_TIMEOUT_MS);
        await assertion;
      } finally {
        vi.useRealTimers();
      }
    },
  );
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
