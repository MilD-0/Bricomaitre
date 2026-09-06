import { describe, expect, it } from 'vitest';

import {
  assertReviewedOrderPrices,
  buildOrderCommercialValues,
  UnorderableCartError,
} from './order-commercial';

describe('order commercial values', () => {
  it('rejects a price change or expired promotion before accepting an order', () => {
    expect(() =>
      assertReviewedOrderPrices(
        { promo: null, productSubtotal: 1500 },
        { expectedProductSubtotal: 1200 },
      ),
    ).toThrow(UnorderableCartError);
    expect(() =>
      assertReviewedOrderPrices(
        { promo: null, productSubtotal: 1500 },
        { promoCode: 'EXPIRED', expectedProductSubtotal: 1500 },
      ),
    ).toThrow(UnorderableCartError);
    expect(() =>
      assertReviewedOrderPrices(
        { promo: null, productSubtotal: 1500 },
        { expectedProductSubtotal: 1500 },
      ),
    ).not.toThrow();
    expect(() =>
      assertReviewedOrderPrices({ promo: null, productSubtotal: 1500 }, {}),
    ).not.toThrow();
  });
  it('persists product subtotal and grand total for non-promotional orders', () => {
    expect(
      buildOrderCommercialValues(
        {
          cartProducts: ['7', '7'],
          lines: [],
          promo: null,
          productSubtotal: 2000,
          originalProductSubtotal: 2000,
          discountAmount: 0,
        },
        500,
      ),
    ).toMatchObject({
      productSubtotal: '2000.00',
      totalAmount: '2500.00',
      promoCode: null,
      promoDiscountAmount: null,
    });
  });

  it('persists all product offers with aggregate discount and rejects a missing accepted offer', () => {
    const productPromos = [
      { productId: 7, code: 'A', originalPrice: 1000, promoPrice: 800, discountAmount: 200 },
      { productId: 8, code: 'B', originalPrice: 2000, promoPrice: 1500, discountAmount: 500 },
    ];
    const commercial = {
      cartProducts: ['7', '8'],
      lines: [],
      promo: null,
      productPromos,
      productSubtotal: 2300,
      originalProductSubtotal: 3000,
      discountAmount: 700,
    };
    expect(buildOrderCommercialValues(commercial, 600)).toMatchObject({
      productSubtotal: '2300.00',
      totalAmount: '2900.00',
      promoCode: null,
      promoProductId: null,
      productPromos: [
        { productId: 7, code: 'A' },
        { productId: 8, code: 'B' },
      ],
      promoDiscountAmount: '700.00',
    });
    expect(() =>
      assertReviewedOrderPrices(commercial, { productPromos, expectedProductSubtotal: 2300 }),
    ).not.toThrow();
    expect(() =>
      assertReviewedOrderPrices(
        { ...commercial, productPromos: productPromos.slice(0, 1) },
        { productPromos, expectedProductSubtotal: 2300 },
      ),
    ).toThrow(UnorderableCartError);
  });

  it('uses immutable line-derived promotional totals', () => {
    expect(
      buildOrderCommercialValues(
        {
          cartProducts: ['7'],
          lines: [],
          promo: {
            code: 'SAVE',
            productId: 7,
            originalPrice: 2000,
            promoPrice: 1500,
            discountAmount: 500,
            originalSubtotal: 2000,
            finalSubtotal: 1500,
          },
          productSubtotal: 1500,
          originalProductSubtotal: 2000,
          discountAmount: 500,
        },
        500,
      ),
    ).toMatchObject({
      productSubtotal: '1500.00',
      totalAmount: '2000.00',
      promoCode: 'SAVE',
      promoOriginalSubtotal: '2000.00',
      promoDiscountAmount: '500.00',
      promoFinalSubtotal: '1500.00',
    });
  });
});
