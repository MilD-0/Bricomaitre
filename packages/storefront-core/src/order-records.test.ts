import { describe, expect, it } from 'vitest';

import { orders } from '@bric/db/schema';
import { OrderProductLookup, toOrderRecord } from './order-records';

function orderRow(overrides: Partial<typeof orders.$inferSelect> = {}): typeof orders.$inferSelect {
  const now = new Date('2026-08-18T10:00:00.000Z');
  return {
    id: 41,
    mongoId: null,
    firstName: 'Ada',
    lastName: 'Lovelace',
    state: 16,
    city: 'Alger Centre',
    homeAddress: '1 Example Street',
    email: null,
    phoneNumber1: '0550000000',
    normalizedPhone: '213550000000',
    phoneNumber2: null,
    publicToken: 'public-order-token',
    cartProducts: ['7', '7'],
    visitId: null,
    journeyId: null,
    sessionId: null,
    variant: null,
    delivery: 0,
    delPr: '500.00',
    productSubtotal: '2000.00',
    totalAmount: '2500.00',
    price: null,
    promoCode: null,
    promoProductId: null,
    promoOriginalSubtotal: null,
    promoDiscountAmount: null,
    promoFinalSubtotal: null,
    note: null,
    confirmed: 0,
    noAnswerCount: 0,
    confirmedBy: null,
    confirmedByName: null,
    confirmedAt: null,
    ecotrackStatus: null,
    ecotrackStatusLastUpdate: null,
    ecotrackStatusData: null,
    ecotrackReference: null,
    ecotrackTrackingNumber: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('immutable order presentation', () => {
  it('uses line snapshots instead of rewritten catalog title, price, and image values', () => {
    const lookup = new OrderProductLookup();
    lookup.set('id:7', {
      id: 7,
      mongoId: null,
      brandId: 9,
      slug: 'renamed-product',
      title: 'New catalog title',
      price: 9999,
      thumbnailUrl: 'https://cdn.example.test/new.webp',
    });
    lookup.orderLinesByOrderId.set(41, [
      {
        productId: 7,
        contentId: '7',
        rawValue: '7',
        title: 'Original order title',
        effectiveUnitPrice: 1000,
        quantity: 2,
        lineTotal: 2000,
        thumbnailUrl: 'https://cdn.example.test/original.webp',
      },
    ]);

    const result = toOrderRecord(orderRow(), [], lookup);

    expect(result.orderProducts).toEqual([
      expect.objectContaining({
        title: 'Original order title',
        unitPrice: 1000,
        quantity: 2,
        lineTotal: 2000,
        thumbnailUrl: 'https://cdn.example.test/original.webp',
        slug: 'renamed-product',
      }),
    ]);
    expect(result.productSubtotal).toBe(2000);
    expect(result.totalAmount).toBe(2500);
  });

  it('does not apply a promotion twice when the immutable line already contains its discount', () => {
    const lookup = new OrderProductLookup();
    lookup.orderLinesByOrderId.set(41, [
      {
        productId: 7,
        contentId: '7',
        rawValue: '7',
        title: 'Discounted item',
        effectiveUnitPrice: 750,
        quantity: 2,
        lineTotal: 1500,
        thumbnailUrl: null,
      },
    ]);

    const result = toOrderRecord(
      orderRow({
        productSubtotal: '1500.00',
        totalAmount: '2000.00',
        promoCode: 'SAVE250',
        promoProductId: 7,
        promoDiscountAmount: '500.00',
        promoFinalSubtotal: '1500.00',
      }),
      [],
      lookup,
    );

    expect(result.orderProducts[0]).toMatchObject({ unitPrice: 750, lineTotal: 1500 });
    expect(result.productSubtotal).toBe(1500);
    expect(result.totalAmount).toBe(2000);
  });
});
