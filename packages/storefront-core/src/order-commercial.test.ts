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
